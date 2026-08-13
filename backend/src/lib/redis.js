import { createClient } from 'redis';
import { env } from '../config/env.js';
import logger from './logger.js';

/**
 * Redis client used for the session store and for tracking a user's active
 * session ids.
 *
 * It is deliberately *optional*: if Redis is not reachable at boot the server
 * still starts and express-session falls back to an in-memory store. Sessions
 * then don't survive a restart and don't work across multiple instances, but a
 * local demo needs no extra infrastructure. `redisReady` tells the rest of the
 * app which mode it is in.
 */
export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    // Don't retry forever at boot — we want a fast, definitive answer so the
    // server can decide between the Redis store and the memory fallback.
    connectTimeout: 2000,
    reconnectStrategy: (retries) => (retries > 5 ? false : Math.min(retries * 200, 2000)),
  },
});

let ready = false;

/** True when the session store is backed by Redis. */
export const redisReady = () => ready;

redis.on('connect', () => logger.info('Redis connected'));
redis.on('ready', () => {
  ready = true;
});
// Without a listener an 'error' event on the client would crash the process.
redis.on('error', (err) => {
  if (ready) logger.error(`Redis error: ${err.message}`);
});
redis.on('end', () => {
  ready = false;
  logger.warn('Redis connection closed');
});

/**
 * Try to connect. Never throws — returns whether Redis is available so the
 * caller can wire up the right session store.
 */
export const connectRedis = async () => {
  if (!env.REDIS_ENABLED) {
    logger.warn('REDIS_ENABLED=false — using the in-memory session store');
    return false;
  }

  try {
    await redis.connect();
    await redis.ping();
    ready = true;
    return true;
  } catch (error) {
    ready = false;
    logger.warn(
      `Redis unavailable at ${env.REDIS_URL} (${error.message}) — falling back to the in-memory session store. ` +
        'Sessions will not survive a server restart.'
    );
    // Stop the client retrying in the background once we've given up on it.
    try {
      redis.destroy();
    } catch {
      /* client was never open — nothing to tear down */
    }
    return false;
  }
};

export const disconnectRedis = async () => {
  if (!ready) return;
  await redis.quit().catch(() => {});
  ready = false;
};

/** Best-effort session bookkeeping — a no-op when Redis is not connected. */
export const trackSession = async (userId, sessionId) => {
  if (!ready) return;
  await redis.sAdd(`user:${userId}:sessions`, sessionId).catch(() => {});
};

export const untrackSession = async (userId, sessionId) => {
  if (!ready) return;
  await redis.sRem(`user:${userId}:sessions`, sessionId).catch(() => {});
};
