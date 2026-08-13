import * as authService from '../services/authService.js';
import * as sessionService from '../services/sessionService.js';
import * as otpService from '../services/otpService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import { assessRisk, explainRisk } from '../lib/risk.js';
import { clientIp } from '../lib/geo.js';
import { env } from '../config/env.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

/** Promisified session.regenerate + save, so controllers stay flat. */
const openSession = (req, userId) =>
  new Promise((resolve, reject) => {
    // Prevent session fixation: never reuse the pre-login session id.
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = String(userId);
      req.session.loginAt = new Date().toISOString();
      req.session.save((err2) => (err2 ? reject(err2) : resolve(req.session.id)));
    });
  });

const publicUser = (u) => ({
  id: u._id ?? u.id,
  tenantId: u.tenantId,
  name: u.name,
  email: u.email,
  role: u.role,
  team: u.team ?? null,
  status: u.status,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt ?? null,
});

export const signup = async (req, res) => {
  const user = await authService.signup(req.validated.body);

  // No email verification — the account is usable immediately, so sign in.
  const sid = await openSession(req, user.id);
  const context = await sessionService.requestContext(req);
  await sessionService.registerSession({ user, sid, context, risk: null });

  res.status(201).json({ user });
};

/**
 * Password login, gated by risk-based authentication.
 *
 * A correct password is necessary but not always sufficient: if the risk
 * engine flags the attempt, no session is created. Instead we return a
 * challenge id and email a one-time code. Nothing is authenticated until
 * /auth/verify-otp succeeds.
 */
export const login = async (req, res) => {
  const user = await authService.login(req.validated.body);

  const context = await sessionService.requestContext(req);
  const knownSessions = await sessionService.knownSessionsFor(user.id);

  const risk = assessRisk({
    fingerprint: context.fingerprint,
    geo: context.geo,
    knownSessions,
    lastLoginAt: user.lastLoginAt,
  });

  if (risk.requiresStepUp) {
    const reasonText = explainRisk(risk.reasons);
    const { challengeId, devCode } = await otpService.createChallenge({
      user,
      context,
      risk,
      reasonText,
    });

    return res.status(200).json({
      stepUpRequired: true,
      challengeId,
      reason: reasonText,
      riskScore: risk.score,
      riskReasons: risk.reasons,
      detail: risk.detail,
      maskedEmail: maskEmail(user.email),
      devCode, // development only — undefined in production
    });
  }

  const sid = await openSession(req, user.id);
  const { evicted } = await sessionService.registerSession({ user, sid, context, risk });

  res.json({ user, evictedSessions: evicted });
};

/** Complete a step-up challenge and open the session. */
export const verifyOtp = async (req, res) => {
  const { challengeId, code } = req.validated.body;

  const { userId } = await otpService.verifyChallenge({ challengeId, code });

  const user = await User.findOne({ _id: userId, deletedAt: null }).lean();
  if (!user) throw AppError.unauthorized('Account no longer exists');

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  const sid = await openSession(req, user._id);
  const context = await sessionService.requestContext(req);
  const { evicted } = await sessionService.registerSession({
    user,
    sid,
    context,
    risk: null,
    stepUpVerified: true,
  });

  res.json({ user: publicUser(user), evictedSessions: evicted });
};

export const me = async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenantId).lean();
  res.json({
    user: publicUser(req.user),
    tenant: tenant ? { id: tenant._id, name: tenant.name, slug: tenant.slug } : null,
  });
};

export const logout = async (req, res, next) => {
  const sid = req.session.id;
  const userId = req.session.userId;

  req.session.destroy(async (err) => {
    if (err) return next(err);
    if (userId) await sessionService.endSession(userId, sid);
    res.clearCookie('sid');
    res.status(204).end();
  });
};

// ── Device / session management ────────────────────────────────────────────

export const listSessions = async (req, res) => {
  const sessions = await sessionService.listSessions(req.user._id, req.session.id);
  res.json({ sessions, max: env.MAX_CONCURRENT_SESSIONS });
};

export const revokeSession = async (req, res) => {
  const ok = await sessionService.revokeSession(req.user._id, req.params.id);
  if (!ok) throw AppError.notFound('Session not found');
  res.status(204).end();
};

export const revokeOtherSessions = async (req, res) => {
  const count = await sessionService.revokeAllSessions(req.user._id, {
    exceptSid: req.session.id,
  });
  res.json({ revoked: count });
};

// ── Account recovery ───────────────────────────────────────────────────────

export const forgotPassword = async (req, res) => {
  const result = await passwordResetService.requestReset({
    email: req.validated.body.email,
    ip: clientIp(req),
  });

  // Identical response whether or not the address exists — no enumeration.
  res.json({
    message: 'If that email is registered, a reset link is on its way.',
    devToken: result.devToken,
  });
};

export const resetPassword = async (req, res) => {
  const result = await passwordResetService.performReset(req.validated.body);
  res.json({ message: 'Password updated. Please sign in.', ...result });
};

/** j***@example.com — enough to recognise, not enough to harvest. */
function maskEmail(email = '') {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  const head = name.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`;
}
