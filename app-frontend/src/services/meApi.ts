import type { Language } from '../i18n/language';
import type { PublicUser } from '../types/auth';
import { apiRequest } from './api';

/** GET /me: the signed-in user's account, fresh from the server. */
export const getMe = (accessToken: string) =>
  apiRequest<{ user: PublicUser }>('/me', { accessToken });

/** PATCH /me: saves the app language to the account (it follows the user to any device). */
export const saveMyLanguage = (accessToken: string, preferredLanguage: Language) =>
  apiRequest<{ user: PublicUser }>('/me', {
    method: 'PATCH',
    accessToken,
    body: { preferredLanguage },
  });
