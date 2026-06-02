// src/services/authService.js
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import AppError from '../utils/AppError.js';
import { sendMail } from '../lib/mailer.js';

const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'facility';

/** Build a tenant slug that is guaranteed unique by suffixing if needed. */
const uniqueSlug = async (base) => {
  let slug = slugify(base);
  let n = 1;
  while (await Tenant.exists({ slug })) slug = `${slugify(base)}-${n++}`;
  return slug;
};

/**
 * A new signup provisions a brand-new tenant and the signer becomes its admin.
 * Additional team members are created by that admin (see createMember).
 */
export const signup = async ({ email, password, name, organization }) => {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const orgName = organization || `${name}'s Facility`;
  const tenant = await Tenant.create({ name: orgName, slug: await uniqueSlug(orgName) });

  let user;
  try {
    user = await User.create({
      email,
      passwordHash,
      name,
      tenantId: tenant._id,
      role: 'admin', // founder of a new tenant
    });
  } catch (err) {
    // Roll back the orphan tenant if user creation fails (e.g. duplicate email).
    await Tenant.deleteOne({ _id: tenant._id }).catch(() => {});
    throw err;
  }

  sendMail({
    to: user.email,
    subject: 'Welcome to Facility Ops Hub',
    text: `Hi ${user.name}, your facility "${tenant.name}" is ready.`,
  }).catch(() => {});

  return { ...user.toJSON(), tenant: tenant.toJSON() };
};

/** Admin-only: add a team member to the admin's own tenant. */
export const createMember = async ({ admin, email, password, name, role, team }) => {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({
    email,
    passwordHash,
    name,
    role,
    team: team || null,
    tenantId: admin.tenantId,
  });

  sendMail({
    to: email,
    subject: 'You have been added to Facility Ops Hub',
    text: `Hi ${name}, an account was created for you as ${role}. Password: ${password}`,
  }).catch(() => {});

  return user.toJSON();
};

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