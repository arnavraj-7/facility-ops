import AppError from '../utils/AppError.js';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import { touchSession } from '../services/sessionService.js';

// Only refresh lastSeenAt at most once a minute per request stream — the
// device list doesn't need second-level precision and this keeps a write off
// the hot path of every single request.
const TOUCH_INTERVAL_MS = 60_000;
const lastTouched = new Map(); // sid -> timestamp

export const requireAuth = async (req, res, next) => {
  if (!req.session?.userId) {
    return next(AppError.unauthorized());
  }

  const user = await User.findOne({
    _id: req.session.userId,
    deletedAt: null,
  }).lean();

  if (!user) {
    req.session.destroy(() => {});
    return next(AppError.unauthorized('Session invalid'));
  }
  if (user.status === 'suspended') {
    return next(AppError.forbidden('Account suspended'));
  }

  // A session revoked from another device (or evicted by the concurrent-device
  // limit) must stop working immediately, even though its cookie is still
  // valid and its store record may still be alive.
  const registry = await UserSession.findOne({ sid: req.session.id })
    .select('revokedAt revokedReason')
    .lean();

  if (registry?.revokedAt) {
    req.session.destroy(() => {});
    return next(
      AppError.unauthorized(
        registry.revokedReason === 'device_limit'
          ? 'Signed out because this account reached its device limit'
          : 'This session was signed out',
        'SESSION_REVOKED'
      )
    );
  }

  req.user = user;

  const now = Date.now();
  const seen = lastTouched.get(req.session.id) || 0;
  if (now - seen > TOUCH_INTERVAL_MS) {
    lastTouched.set(req.session.id, now);
    touchSession(req.session.id); // fire-and-forget
  }

  next();
};
