// src/middlewares/session.js
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { redis } from '../lib/redis.js';
import { env, isProd } from '../config/env.js';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const sessionMiddleware = session({
  name: 'sid', // (security by obscurity)
  secret: env.SESSION_SECRET,
  
  store: new RedisStore({
    client: redis,
    prefix: 'sess:', // Keys will look like "sess:12345abcde"
    ttl: SESSION_TTL_SECONDS,
  }),

  resave: false, // Don't burn Redis writes if the session hasn't changed
  saveUninitialized: false, // Don't create empty sessions for unauthenticated visitors
  rolling: true, // Reset the 7-day timer every time the user interacts with the API

  cookie: {
    httpOnly: true, // CRITICAL: Prevents XSS attacks from reading the cookie
    secure: isProd, // True in production (HTTPS)
    sameSite: 'none', // Defends against CSRF attacks
    maxAge: SESSION_TTL_SECONDS * 1000, 
    path: '/',
  },
});