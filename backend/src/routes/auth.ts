import { Router } from 'express';
import {
  forgot,
  login,
  logout,
  refresh,
  register,
  resendVerificationCode,
  reset,
  verifyEmailCode,
} from '../controllers/authController.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.post('/verify-email', verifyEmailCode);
authRouter.post('/verify-email/resend', resendVerificationCode);
authRouter.post('/forgot', forgot);
authRouter.post('/reset', reset);
