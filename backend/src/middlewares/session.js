// src/middlewares/session.js
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { redis } from '../lib/redis.js';
import { env, isProd } from '../config/env.js';
import logger from '../lib/logger.js';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Secure cookies follow NODE_ENV unless COOKIE_SECURE explicitly overrides it.
const secureCookie = env.COOKIE_SECURE ?? isProd;

/**
 * Build the express-session middleware against whichever store is available.
 * Redis is the real store; the in-memory default is a demo/dev fallback so the
 * app boots on a machine with no Redis installed.
 */
const build = (useRedis) => {
  if (useRedis) {
    logger.info('Session store: Redis');
  } else {
    logger.warn('Session store: in-memory (single process only, cleared on restart)');
  }

  return session({
    name: 'sid', // (security by obscurity)
    secret: env.SESSION_SECRET,

    store: useRedis
      ? new RedisStore({
          client: redis,
          prefix: 'sess:', // Keys will look like "sess:12345abcde"
          ttl: SESSION_TTL_SECONDS,
        })
      : undefined, // express-session's MemoryStore

    resave: false, // Don't burn store writes if the session hasn't changed
    saveUninitialized: false, // Don't create empty sessions for anonymous visitors
    rolling: true, // Reset the 7-day timer on every interaction

    cookie: {
      httpOnly: true, // CRITICAL: prevents XSS from reading the cookie
      secure: secureCookie,
      // SameSite=None requires Secure (browsers reject it over plain http), so
      // only use it for genuinely cross-site secure setups. Same-origin
      // deployments (the Vite dev proxy) work correctly with 'lax'.
      sameSite: secureCookie ? 'none' : 'lax',
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
    },
  });
};

let handler = null;

/** Called once at boot, after we know whether Redis connected. */
export const initSession = (useRedis) => {
  handler = build(useRedis);
};

/**
 * Stable middleware reference so app.js can wire it up at import time while
 * the concrete store is chosen later, once the Redis probe has finished.
 */
export const sessionMiddleware = (req, res, next) => {
  if (!handler) handler = build(false);
  return handler(req, res, next);
};
