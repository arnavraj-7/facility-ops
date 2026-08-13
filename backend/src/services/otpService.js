import { randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { redis, redisReady } from '../lib/redis.js';
import OtpChallenge from '../models/OtpChallenge.js';
import { sendAlert } from '../lib/alerts.js';
import { env, isProd } from '../config/env.js';
import AppError from '../utils/AppError.js';
import logger from '../lib/logger.js';

/**
 * Step-up email OTP for risk-based authentication.
 *
 * When the risk engine flags a login, the password alone is not enough: we
 * park the attempt as a *challenge* (deliberately NOT a session — nothing is
 * authenticated until the code is verified) and email a one-time code.
 *
 * Security properties:
 *  - The code is generated with crypto.randomInt, not Math.random, so it is
 *    not predictable from previous codes.
 *  - Only a SHA-256 hash of the code is stored. A dump of the challenge store
 *    does not let an attacker complete a login.
 *  - Verification uses crypto.timingSafeEqual, so an attacker cannot learn the
 *    code digit-by-digit by measuring how long a comparison takes.
 *  - Attempts are capped and the challenge expires, so the 6-digit space
 *    (1,000,000) cannot be brute-forced.
 */

const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;

const hashCode = (code) => createHash('sha256').update(code).digest();

/** Cryptographically random, zero-padded 6-digit code. */
const generateCode = () =>
  String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

const challengeKey = (id) => `otp:${id}`;

/** Redis is the fast path; Mongo keeps the feature working without Redis. */
const putChallenge = async (id, payload, ttlSeconds) => {
  if (redisReady()) {
    await redis.set(challengeKey(id), JSON.stringify(payload), { EX: ttlSeconds });
    return;
  }
  await OtpChallenge.create({
    challengeId: id,
    ...payload,
    codeHash: Buffer.from(payload.codeHash).toString('hex'),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });
};

const getChallenge = async (id) => {
  if (redisReady()) {
    const raw = await redis.get(challengeKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...parsed, codeHash: Buffer.from(parsed.codeHash.data ?? parsed.codeHash) };
  }
  const doc = await OtpChallenge.findOne({ challengeId: id }).lean();
  if (!doc || doc.expiresAt < new Date()) return null;
  return { ...doc, codeHash: Buffer.from(doc.codeHash, 'hex') };
};

const updateChallenge = async (id, payload, ttlSeconds) => {
  if (redisReady()) {
    const ttl = await redis.ttl(challengeKey(id));
    await redis.set(challengeKey(id), JSON.stringify(payload), {
      EX: ttl > 0 ? ttl : ttlSeconds,
    });
    return;
  }
  await OtpChallenge.updateOne({ challengeId: id }, { $set: { attempts: payload.attempts } });
};

const dropChallenge = async (id) => {
  if (redisReady()) {
    await redis.del(challengeKey(id)).catch(() => {});
    return;
  }
  await OtpChallenge.deleteOne({ challengeId: id }).catch(() => {});
};

/**
 * Create a step-up challenge and deliver the code.
 * Returns the challenge id the client must present alongside the code.
 */
export const createChallenge = async ({ user, context, risk, reasonText }) => {
  const challengeId = randomBytes(24).toString('base64url');
  const code = generateCode();
  const ttl = env.OTP_TTL_MINUTES * 60;

  await putChallenge(
    challengeId,
    {
      userId: String(user._id ?? user.id),
      codeHash: hashCode(code),
      attempts: 0,
      fingerprint: context.fingerprint,
      riskScore: risk.score,
      riskReasons: risk.reasons,
      createdAt: Date.now(),
    },
    ttl
  );

  await sendAlert({
    to: user.email,
    subject: `Your Facility Ops verification code: ${code}`,
    body:
      `We detected a sign-in from ${reasonText}. ` +
      `Enter ${code} to continue. It expires in ${env.OTP_TTL_MINUTES} minutes. ` +
      `If this wasn't you, change your password immediately.`,
    channel: 'email',
  });

  logger.info(
    `Step-up OTP issued for ${user.email} (risk ${risk.score}: ${risk.reasons.join(', ')})`
  );

  // Outside production the code is returned so the flow can be demoed and
  // tested without reading the server log. Never do this in production.
  return { challengeId, devCode: isProd ? undefined : code };
};

/**
 * Verify a submitted code. Throws on any failure; resolves with the userId on
 * success. The challenge is single-use either way.
 */
export const verifyChallenge = async ({ challengeId, code }) => {
  const challenge = await getChallenge(challengeId);
  if (!challenge) {
    throw AppError.unauthorized('That code has expired. Please sign in again.', 'OTP_EXPIRED');
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    await dropChallenge(challengeId);
    throw AppError.unauthorized('Too many incorrect codes. Please sign in again.', 'OTP_LOCKED');
  }

  const submitted = hashCode(String(code));
  const expected = Buffer.from(challenge.codeHash);

  // Both are SHA-256 digests, so lengths always match — but guard anyway,
  // because timingSafeEqual throws on a length mismatch.
  const ok = submitted.length === expected.length && timingSafeEqual(submitted, expected);

  if (!ok) {
    const attempts = challenge.attempts + 1;
    await updateChallenge(challengeId, { ...challenge, attempts }, env.OTP_TTL_MINUTES * 60);
    throw AppError.unauthorized(
      `Incorrect code. ${MAX_ATTEMPTS - attempts} attempt(s) remaining.`,
      'OTP_INVALID'
    );
  }

  await dropChallenge(challengeId); // single use
  return { userId: challenge.userId, fingerprint: challenge.fingerprint };
};
