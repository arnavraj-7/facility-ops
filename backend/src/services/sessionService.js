import UserSession from '../models/UserSession.js';
import { redis, redisReady } from '../lib/redis.js';
import { sessionStore, SESSION_PREFIX } from '../middlewares/session.js';
import { deviceFingerprint, describeDevice } from '../lib/deviceFingerprint.js';
import { lookupGeo, clientIp } from '../lib/geo.js';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';

/**
 * Session lifecycle: registration, concurrent-device limiting and garbage
 * collection of orphaned records.
 */

/** Does the underlying session still exist in the express-session store? */
const existsInStore = (sid) =>
  new Promise((resolve) => {
    if (redisReady()) {
      redis
        .exists(`${SESSION_PREFIX}${sid}`)
        .then((n) => resolve(n === 1))
        .catch(() => resolve(false));
      return;
    }
    // MemoryStore (and any other store) exposes get(sid, cb).
    const store = sessionStore();
    if (!store?.get) return resolve(false);
    store.get(sid, (err, sess) => resolve(!err && !!sess));
  });

/** Destroy a session in the store, so the cookie stops working immediately. */
const destroyInStore = (sid) =>
  new Promise((resolve) => {
    const store = sessionStore();
    if (!store?.destroy) return resolve();
    store.destroy(sid, () => resolve());
  });

/**
 * Garbage-collect orphaned session records for a user.
 *
 * A row is orphaned when the store no longer holds the session it shadows —
 * the TTL lapsed, Redis was flushed, or the process restarted while using the
 * memory store. Without this the "3 device" cap would fill up with ghosts and
 * eventually lock a legitimate user out of their own account.
 *
 * Returns the number of rows reclaimed.
 */
export const gcOrphanedSessions = async (userId) => {
  const rows = await UserSession.find({ userId, revokedAt: null }).select('sid').lean();

  const checks = await Promise.all(
    rows.map(async (row) => ({ row, alive: await existsInStore(row.sid) }))
  );
  const dead = checks.filter((c) => !c.alive).map((c) => c.row._id);
  if (dead.length === 0) return 0;

  await UserSession.updateMany(
    { _id: { $in: dead } },
    { $set: { revokedAt: new Date(), revokedReason: 'expired' } }
  );

  if (redisReady()) {
    const sids = checks.filter((c) => !c.alive).map((c) => c.row.sid);
    await redis.sRem(`user:${userId}:sessions`, sids).catch(() => {});
  }

  logger.info(`Session GC: reclaimed ${dead.length} orphaned session(s) for user ${userId}`);
  return dead.length;
};

/**
 * Enforce the concurrent-device cap.
 *
 * Runs *after* GC so only genuinely live sessions count. When the user is at
 * the limit, the oldest session (by last activity) is evicted — the same
 * behaviour as Amazon Prime or Netflix signing out your least-used device
 * rather than refusing the new sign-in.
 *
 * Returns the sessions that were evicted, so the caller can tell the user.
 */
export const enforceSessionLimit = async (userId, { keepSid } = {}) => {
  const max = env.MAX_CONCURRENT_SESSIONS;

  const active = await UserSession.find({ userId, revokedAt: null })
    .sort({ lastSeenAt: -1 })
    .lean();

  const candidates = keepSid ? active.filter((s) => s.sid !== keepSid) : active;

  // Keep (max - 1) so there is room for the session about to be created.
  const overflow = candidates.slice(Math.max(0, max - (keepSid ? 0 : 1)));
  if (overflow.length === 0) return [];

  await Promise.all(overflow.map((s) => destroyInStore(s.sid)));
  await UserSession.updateMany(
    { _id: { $in: overflow.map((s) => s._id) } },
    { $set: { revokedAt: new Date(), revokedReason: 'device_limit' } }
  );

  if (redisReady()) {
    await redis.sRem(`user:${userId}:sessions`, overflow.map((s) => s.sid)).catch(() => {});
  }

  logger.info(
    `Session limit: evicted ${overflow.length} session(s) for user ${userId} (cap ${max})`
  );
  return overflow.map((s) => ({ deviceLabel: s.deviceLabel, lastSeenAt: s.lastSeenAt }));
};

/**
 * Everything we know about the devices a user signs in from — the history the
 * risk engine compares a new attempt against. Revoked rows are included on
 * purpose: signing out of a device doesn't make it unfamiliar.
 */
export const knownSessionsFor = async (userId) =>
  UserSession.find({ userId })
    .sort({ lastSeenAt: -1 })
    .limit(50)
    .select('fingerprint geo lastSeenAt')
    .lean();

/** Build the device/location context for the current request. */
export const requestContext = async (req) => {
  const ip = clientIp(req);
  return {
    ip,
    fingerprint: deviceFingerprint(req),
    deviceLabel: describeDevice(req),
    geo: await lookupGeo(ip),
  };
};

/**
 * Record a newly-created session, after GC and limit enforcement have made
 * room for it.
 */
export const registerSession = async ({ user, sid, context, risk, stepUpVerified = false }) => {
  await gcOrphanedSessions(user._id ?? user.id);
  const evicted = await enforceSessionLimit(user._id ?? user.id);

  const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

  await UserSession.create({
    userId: user._id ?? user.id,
    tenantId: user.tenantId,
    sid,
    fingerprint: context.fingerprint,
    deviceLabel: context.deviceLabel,
    ip: context.ip,
    geo: {
      country: context.geo.country,
      city: context.geo.city,
      lat: context.geo.lat,
      lon: context.geo.lon,
    },
    stepUpVerified,
    riskScore: risk?.score ?? 0,
    riskReasons: risk?.reasons ?? [],
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
  });

  if (redisReady()) {
    await redis.sAdd(`user:${user._id ?? user.id}:sessions`, sid).catch(() => {});
  }

  return { evicted };
};

/** Keep lastSeenAt fresh so "oldest device" eviction reflects real usage. */
export const touchSession = async (sid) => {
  await UserSession.updateOne(
    { sid, revokedAt: null },
    { $set: { lastSeenAt: new Date() } }
  ).catch(() => {});
};

/** The device list shown in Security settings. */
export const listSessions = async (userId, currentSid) => {
  await gcOrphanedSessions(userId);
  const rows = await UserSession.find({ userId, revokedAt: null })
    .sort({ lastSeenAt: -1 })
    .lean();

  return rows.map((r) => ({
    id: String(r._id),
    deviceLabel: r.deviceLabel,
    ip: r.ip,
    location:
      r.geo?.city && r.geo.city !== 'unknown' ? `${r.geo.city}, ${r.geo.country}` : r.geo?.country,
    lastSeenAt: r.lastSeenAt,
    createdAt: r.createdAt,
    stepUpVerified: r.stepUpVerified,
    current: r.sid === currentSid,
  }));
};

/** Revoke one device by its registry id. */
export const revokeSession = async (userId, id) => {
  const row = await UserSession.findOne({ _id: id, userId, revokedAt: null });
  if (!row) return false;

  await destroyInStore(row.sid);
  row.revokedAt = new Date();
  row.revokedReason = 'user_revoked';
  await row.save();

  if (redisReady()) await redis.sRem(`user:${userId}:sessions`, row.sid).catch(() => {});
  return true;
};

/** Sign out everywhere — used after a password reset. */
export const revokeAllSessions = async (userId, { exceptSid = null, reason = 'revoked_all' } = {}) => {
  const rows = await UserSession.find({ userId, revokedAt: null }).lean();
  const targets = rows.filter((r) => r.sid !== exceptSid);
  if (targets.length === 0) return 0;

  await Promise.all(targets.map((r) => destroyInStore(r.sid)));
  await UserSession.updateMany(
    { _id: { $in: targets.map((r) => r._id) } },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );

  if (redisReady()) {
    await redis.sRem(`user:${userId}:sessions`, targets.map((r) => r.sid)).catch(() => {});
  }
  return targets.length;
};

/** Mark a single row revoked on explicit logout. */
export const endSession = async (userId, sid) => {
  await UserSession.updateOne(
    { sid, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } }
  ).catch(() => {});
  if (redisReady()) await redis.sRem(`user:${userId}:sessions`, sid).catch(() => {});
};
