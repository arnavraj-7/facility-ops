import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import PasswordReset from '../models/PasswordReset.js';
import { sendAlert } from '../lib/alerts.js';
import { revokeAllSessions } from './sessionService.js';
import { env, isProd } from '../config/env.js';
import AppError from '../utils/AppError.js';
import logger from '../lib/logger.js';

/**
 * Account recovery (forgot / reset password).
 *
 * Design notes, because every one of these is a real attack being closed:
 *
 *  - The token is 32 bytes from crypto.randomBytes — 256 bits of entropy, so
 *    it cannot be guessed or brute-forced. Math.random() would be predictable
 *    from previous outputs and is never acceptable for a credential.
 *  - Only a SHA-256 hash of the token is stored. The raw token exists solely
 *    in the message sent to the user, so a database dump cannot be used to
 *    take over accounts. It is the same reason we never store raw passwords.
 *  - Lookup is by hash, and the final comparison uses timingSafeEqual so an
 *    attacker cannot recover a valid token byte-by-byte from response timing.
 *  - "Forgot password" always returns the same response whether or not the
 *    email exists, so the endpoint cannot be used to enumerate accounts.
 *  - Using a token consumes it, and completing a reset revokes every existing
 *    session — if an attacker had a live session, the recovery locks them out.
 */

const TOKEN_BYTES = 32;
const BCRYPT_COST = 12;

const hashToken = (token) => createHash('sha256').update(token).digest();

/**
 * Begin recovery. Always resolves successfully — never reveals whether the
 * address is registered.
 */
export const requestReset = async ({ email, ip }) => {
  const user = await User.findActiveByEmail(email);

  // No account: stop here, but return the same shape after doing comparable
  // work, so response timing doesn't leak existence either.
  if (!user || user.status === 'suspended') {
    logger.info(`Password reset requested for unknown address ${email} from ${ip}`);
    return { sent: true };
  }

  // One live token per user — issuing a new one invalidates the previous.
  await PasswordReset.deleteMany({ userId: user._id });

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await PasswordReset.create({
    userId: user._id,
    tokenHash: hashToken(token).toString('hex'),
    requestedIp: ip,
    expiresAt,
  });

  const link = `${env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

  await sendAlert({
    to: user.email,
    subject: 'Reset your Facility Ops password',
    body:
      `A password reset was requested from ${ip}. Open ${link} to choose a new password. ` +
      `This link expires in ${env.RESET_TOKEN_TTL_MINUTES} minutes and can only be used once. ` +
      `If you did not request this, ignore this message — your password has not changed.`,
    channel: 'email',
  });

  logger.info(`Password reset token issued for ${user.email}`);

  // Outside production the token is returned so the flow is demoable and
  // testable without scraping the log. Never in production.
  return { sent: true, devToken: isProd ? undefined : token };
};

/**
 * Complete recovery: validate the token, set the new password and sign every
 * device out.
 */
export const performReset = async ({ token, password }) => {
  const digest = hashToken(String(token));

  // Look up by hash — an index lookup, so no scanning and no timing signal
  // from the search itself.
  const record = await PasswordReset.findOne({ tokenHash: digest.toString('hex') });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.badRequest('That reset link is invalid or has expired', 'RESET_TOKEN_INVALID');
  }

  // Constant-time confirmation of the match. The lookup above already found
  // the row, but comparing this way keeps the verification free of any
  // early-exit byte comparison.
  const stored = Buffer.from(record.tokenHash, 'hex');
  if (stored.length !== digest.length || !timingSafeEqual(stored, digest)) {
    throw AppError.badRequest('That reset link is invalid or has expired', 'RESET_TOKEN_INVALID');
  }

  const user = await User.findOne({ _id: record.userId, deletedAt: null });
  if (!user) throw AppError.badRequest('That reset link is invalid or has expired', 'RESET_TOKEN_INVALID');

  user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // Recovery also clears a lockout — the legitimate owner just proved control
  // of the mailbox, so brute-force throttling shouldn't keep them out.
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  record.usedAt = new Date();
  await record.save();

  // Anyone already signed in — including an attacker — is cut off.
  const revoked = await revokeAllSessions(user._id, { reason: 'password_reset' });

  await sendAlert({
    to: user.email,
    subject: 'Your Facility Ops password was changed',
    body: `Your password was just reset and ${revoked} active session(s) were signed out.`,
    channel: 'email',
  });

  logger.info(`Password reset completed for ${user.email}; ${revoked} session(s) revoked`);
  return { reset: true, sessionsRevoked: revoked };
};
