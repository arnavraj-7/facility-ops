import * as authService from '../services/authService.js';
import { trackSession, untrackSession } from '../lib/redis.js';
import Tenant from '../models/Tenant.js';

export const signup = async (req, res, next) => {
  const user = await authService.signup(req.validated.body);

  // Sign the new admin straight in — no email verification step, the account
  // is usable the moment it exists.
  req.session.regenerate((err) => {
    if (err) return next(err);

    req.session.userId = user.id;
    req.session.loginAt = new Date().toISOString();

    req.session.save((err2) => {
      if (err2) return next(err2);
      trackSession(user.id, req.session.id);
      res.status(201).json({ user });
    });
  });
};

export const login = async (req, res, next) => {
  const user = await authService.login(req.validated.body);

  // CRITICAL: Prevent session fixation by issuing a new cookie id on login
  req.session.regenerate((err) => {
    if (err) return next(err);

    req.session.userId = user.id;
    req.session.loginAt = new Date().toISOString();
    req.session.userAgent = req.get('user-agent');
    req.session.ip = req.ip;

    req.session.save((err2) => {
      if (err2) return next(err2);
      // Track active sessions (no-op when Redis isn't connected)
      trackSession(user.id, req.session.id);
      res.json({ user });
    });
  });
};

export const me = async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenantId).lean();
  // req.user is a lean object, so the schema's toJSON transform never runs —
  // pick the client-safe fields explicitly instead of spreading the document.
  const u = req.user;
  res.json({
    user: {
      id: u._id,
      tenantId: u.tenantId,
      name: u.name,
      email: u.email,
      role: u.role,
      team: u.team ?? null,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
    },
    tenant: tenant ? { id: tenant._id, name: tenant.name, slug: tenant.slug } : null,
  });
};

export const logout = async (req, res, next) => {
  const sid = req.session.id;
  const userId = req.session.userId;

  req.session.destroy(async (err) => {
    if (err) return next(err);

    if (userId) await untrackSession(userId, sid);

    res.clearCookie('sid');
    res.status(204).end();
  });
};
