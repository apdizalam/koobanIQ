import type { Request, Response } from 'express';
import {
  parseEmailBody,
  parseLoginBody,
  parseRefreshBody,
  parseRegisterBody,
  parseResetPasswordBody,
  parseVerifyEmailBody,
} from '../lib/validate.js';
import {
  forgotPassword,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../services/authService.js';

/** POST /api/v1/auth/register */
export async function register(req: Request, res: Response) {
  const input = parseRegisterBody(req.body);
  const user = await registerUser(input);
  res.status(201).json({ data: { user }, error: null, meta: {} });
}

/** POST /api/v1/auth/login */
export async function login(req: Request, res: Response) {
  const input = parseLoginBody(req.body);
  const result = await loginUser({ ...input, device: req.get('user-agent') });
  res.status(200).json({ data: result, error: null, meta: {} });
}

/** POST /api/v1/auth/refresh: swap a refresh token for a new token pair. */
export async function refresh(req: Request, res: Response) {
  const { refreshToken } = parseRefreshBody(req.body);
  const result = await refreshSession(refreshToken, req.get('user-agent'));
  res.status(200).json({ data: result, error: null, meta: {} });
}

/** POST /api/v1/auth/logout: end this session (its refresh token stops working). */
export async function logout(req: Request, res: Response) {
  const { refreshToken } = parseRefreshBody(req.body);
  await logoutSession(refreshToken);
  res.status(204).end();
}

/** POST /api/v1/auth/verify-email `{ email, code }`: confirm the email with the emailed code. */
export async function verifyEmailCode(req: Request, res: Response) {
  const user = await verifyEmail(parseVerifyEmailBody(req.body));
  res.status(200).json({ data: { user }, error: null, meta: {} });
}

/**
 * Runs an email-sending step but never lets its outcome change the answer:
 * resend and forgot always reply 204, so they can't reveal which emails have
 * accounts. Delivery failures are logged for the team.
 */
async function quietly(step: () => Promise<void>) {
  try {
    await step();
  } catch (err) {
    console.error('Email step failed:', err instanceof Error ? err.message : err);
  }
}

/** POST /api/v1/auth/verify-email/resend `{ email }`: always 204 (at most one code a minute). */
export async function resendVerificationCode(req: Request, res: Response) {
  const input = parseEmailBody(req.body);
  await quietly(() => resendVerification(input));
  res.status(204).end();
}

/** POST /api/v1/auth/forgot `{ email }`: emails a reset code if the account exists; always 204. */
export async function forgot(req: Request, res: Response) {
  const input = parseEmailBody(req.body);
  await quietly(() => forgotPassword(input));
  res.status(204).end();
}

/** POST /api/v1/auth/reset `{ email, code, password }`: set a new password; ends all sessions. */
export async function reset(req: Request, res: Response) {
  await resetPassword(parseResetPasswordBody(req.body));
  res.status(204).end();
}
