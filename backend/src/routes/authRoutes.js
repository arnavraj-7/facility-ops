import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { authLimiter, otpLimiter, resetLimiter } from '../middlewares/rateLimit.js';
import {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/authSchema.js';
import {
  signup,
  login,
  logout,
  me,
  verifyOtp,
  forgotPassword,
  resetPassword,
  listSessions,
  revokeSession,
  revokeOtherSessions,
} from '../controllers/authController.js';

const router = Router();

// ── Authentication ─────────────────────────────────────────────────────────
router.post('/signup', authLimiter, validate({ body: signupSchema }), signup);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);

// Step-up verification for a risk-flagged login. Rate limited separately and
// more tightly — this endpoint guards a 6-digit secret.
router.post('/verify-otp', otpLimiter, validate({ body: verifyOtpSchema }), verifyOtp);

router.post('/logout', logout);
router.get('/me', requireAuth, me);

// ── Account recovery ───────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  resetLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword
);
router.post(
  '/reset-password',
  resetLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword
);

// ── Active devices ─────────────────────────────────────────────────────────
router.get('/sessions', requireAuth, listSessions);
router.delete('/sessions/:id', requireAuth, revokeSession);
router.post('/sessions/revoke-others', requireAuth, revokeOtherSessions);

export default router;
