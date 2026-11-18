import type { Language } from '../i18n/language';
import type { PublicUser, Session } from '../types/auth';
import { apiRequest } from './api';

export const register = (email: string, password: string, preferredLanguage: Language) =>
  apiRequest<{ user: PublicUser }>('/auth/register', {
    method: 'POST',
    body: { email, password, preferredLanguage },
  });

export const login = (email: string, password: string) =>
  apiRequest<Session>('/auth/login', { method: 'POST', body: { email, password } });

/** Swaps a refresh token for a new pair; each refresh token works only once. */
export const refresh = (refreshToken: string) =>
  apiRequest<Session>('/auth/refresh', { method: 'POST', body: { refreshToken } });

export const logout = (refreshToken: string) =>
  apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } });

/** Confirms the email with the 6-digit code that was emailed at sign-up. */
export const verifyEmail = (email: string, code: string) =>
  apiRequest<{ user: PublicUser }>('/auth/verify-email', {
    method: 'POST',
    body: { email, code },
  });

/** Emails a new verification code (the server sends at most one a minute). */
export const resendVerification = (email: string) =>
  apiRequest<void>('/auth/verify-email/resend', { method: 'POST', body: { email } });

/** Emails a password-reset code; the answer is the same whether or not the account exists. */
export const forgotPassword = (email: string) =>
  apiRequest<void>('/auth/forgot', { method: 'POST', body: { email } });

/** Sets a new password with the emailed code; every existing session is ended. */
export const resetPassword = (email: string, code: string, password: string) =>
  apiRequest<void>('/auth/reset', { method: 'POST', body: { email, code, password } });
