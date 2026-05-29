import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { signupSchema, loginSchema ,requestOtpSchema,verifyOtpSchema, requestPasswordResetSchema, resetPasswordSchema,loginStepUpSchema} from '../schemas/authSchema.js';
import { signup, login, logout, me,sendOtp, verifyOtp,requestPasswordReset,resetPassword , loginStepUp} from '../controllers/authController.js';

const router = Router();

router.post('/signup', validate({ body: signupSchema }), signup);
router.post('/login', validate({ body: loginSchema }), login);
router.post('/login/step-up', validate({ body: loginStepUpSchema }), loginStepUp);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

// OTP
router.post('/otp/send', validate({ body: requestOtpSchema }), sendOtp);
router.post('/otp/verify', validate({ body: verifyOtpSchema }), verifyOtp);

// Password Reset
router.post('/password/forgot', validate({ body: requestPasswordResetSchema }), requestPasswordReset);
router.post('/password/reset', validate({ body: resetPasswordSchema }), resetPassword);
export default router;