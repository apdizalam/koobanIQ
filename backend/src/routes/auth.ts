import { Router } from 'express';
import {
  forgot,
  googleCallback,
  googleComplete,
  googleStart,
  login,
  logout,
  refresh,
  register,
  resendVerificationCode,
  reset,
  verifyEmailCode,
} from '../controllers/authController.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.post('/verify-email', verifyEmailCode);
authRouter.post('/verify-email/resend', resendVerificationCode);
authRouter.post('/forgot', forgot);
authRouter.post('/reset', reset);

// Continue with Google (TIQ-39). Public, so each address gets a small limit per step.
const googleLimit = () => rateLimit({ max: 30, windowMs: 10 * 60_000 });
authRouter.get('/google/start', googleLimit(), googleStart);
authRouter.get('/google/callback', googleLimit(), googleCallback);
authRouter.post('/google/complete', googleLimit(), googleComplete);
