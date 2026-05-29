import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import Otp from '../models/Otp.js';
import AuthToken from '../models/AuthToken.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { sendMail } from '../lib/mailer.js';
import { redis } from '../lib/redis.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 mins
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 mins
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 secs

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --- OTP LOGIC ---
export async function sendOtp({ target, purpose }) {
  const recent = await Otp.findOne({ target, purpose }).sort({ createdAt: -1 }).lean();
  if (recent && Date.now() - new Date(recent.createdAt).getTime() < RESEND_COOLDOWN_MS) {
    throw AppError.tooMany('Please wait before requesting another code');
  }

  // Cryptographically secure 6-digit code
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  
  await Otp.create({
    target,
    purpose,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendMail({
    to: target,
    subject: `Your code: ${code}`,
    text: `Your code is: ${code}\nValid for 10 minutes.`,
  });

  return { ok: true };
}

export async function verifyOtp({ target, purpose, code }) {
  const otp = await Otp.findOne({ target, purpose, usedAt: null }).sort({ createdAt: -1 });

  if (!otp) throw AppError.badRequest('Invalid or expired code', 'OTP_INVALID');
  if (otp.expiresAt < new Date()) throw AppError.badRequest('Code expired', 'OTP_EXPIRED');
  if (otp.attempts >= otp.maxAttempts) throw AppError.badRequest('Too many attempts', 'OTP_LOCKED');

  // Increment attempts BEFORE checking the code (prevents crash-loop exploits)
  await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });

  const matches = timingSafeEqualHex(sha256(code), otp.codeHash);
  if (!matches) throw AppError.badRequest('Invalid code', 'OTP_INVALID');

  await Otp.updateOne({ _id: otp._id }, { $set: { usedAt: new Date() } });
  return { ok: true };
}

// --- PASSWORD RESET LOGIC ---
export async function requestPasswordReset({ email, requestIp }) {
  const user = await User.findActiveByEmail(email);
  if (!user) return { ok: true }; // Always return true to prevent email enumeration

  const tokenPlain = crypto.randomBytes(32).toString('hex'); // 64 chars
  
  await AuthToken.create({
    userId: user._id,
    purpose: 'password_reset',
    tokenHash: sha256(tokenPlain),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    requestIp,
  });

  await sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `Use this token to reset (expires 15m): ${tokenPlain}`,
  });

  return { ok: true };
}

export async function resetPassword({ token, newPassword }) {
  const record = await AuthToken.findOne({ tokenHash: sha256(token), purpose: 'password_reset', usedAt: null });

  if (!record) throw AppError.badRequest('Invalid or expired token');
  if (record.expiresAt < new Date()) throw AppError.badRequest('Token expired');

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await Promise.all([
    User.updateOne(
      { _id: record.userId },
      { $set: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } }
    ),
    AuthToken.updateOne({ _id: record._id }, { $set: { usedAt: new Date() } }),
    invalidateAllUserSessions(String(record.userId)),
  ]);

  return { ok: true };
}

async function invalidateAllUserSessions(userId) {
  const sids = await redis.sMembers(`user:${userId}:sessions`);
  if (sids.length) await redis.del(sids.map(s => `sess:${s}`));
  await redis.del(`user:${userId}:sessions`);
}