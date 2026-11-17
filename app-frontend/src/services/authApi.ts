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
