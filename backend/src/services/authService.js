// src/services/authService.js
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { sendMail } from '../lib/mailer.js';

const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const signup = async ({ email, password, name }) => {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  let user;
  try {
    user = await User.create({ email, passwordHash, name });
  } catch (err) {
    throw err; 
  }

  // Fire-and-forget email 
  sendMail({
    to: user.email,
    subject: 'Welcome to FacilityOps',
    text: `Hi ${user.name}, your account is ready.`,
  }).catch(() => {});

  return user.toJSON();
}

export const login = async ({ email, password }) => {
  const user = await User.findActiveByEmail(email).select('+passwordHash');

  // CONSTANT TIME DEFENSE: Even if the user doesn't exist, we MUST hash the password 
  // against a dummy string so hackers can't measure the server response time to guess emails.
  const hashToCompare = user?.passwordHash || '$2b$12$........................................................';
  const passwordOk = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordOk) {
    if (user) await recordFailedAttempt(user);
    // Never reveal whether the email or password was wrong
    throw AppError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (user.status === 'suspended') {
    throw AppError.forbidden('Account suspended', 'ACCOUNT_SUSPENDED');
  }
  if (user.isLocked) {
    throw AppError.forbidden('Account temporarily locked', 'ACCOUNT_LOCKED');
  }

  // Success — reset throttle and record login
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    }
  );

  return user.toJSON();
}

const recordFailedAttempt = async (user) => {
  const nextCount = user.failedLoginAttempts + 1;
  const update = { $inc: { failedLoginAttempts: 1 } };
  
  if (nextCount >= MAX_FAILED_ATTEMPTS) {
    update.$set = { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) };
  }
  await User.updateOne({ _id: user._id }, update);
}

export const getUserById = async (userId) => {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  return user ? user.toJSON() : null;
}