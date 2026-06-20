// src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

// 1. Global Limiter: Generous, applies to all routes
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: 300, // Limit each IP to 300 requests per window
  standardHeaders: 'draft-7', // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { 
    error: { 
      code: 'RATE_LIMITED', 
      message: 'Too many requests from this IP, please try again later.' 
    } 
  },
});

// 2. Strict Auth Limiter: For sensitive routes like /login or /signup
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 login requests per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.'
    },
  },
});

// 3. OTP Limiter: guards a 6-digit secret, so it is tighter than login.
// The per-challenge attempt cap (5) is the primary defence; this stops an
// attacker cycling through fresh challenges to get unlimited guesses.
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'OTP_RATE_LIMITED',
      message: 'Too many verification attempts. Please sign in again shortly.',
    },
  },
});

// 4. Password-reset Limiter: stops the recovery endpoint being used to spam
// a mailbox, or to probe which addresses are registered.
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RESET_RATE_LIMITED',
      message: 'Too many password reset requests. Please try again later.',
    },
  },
});