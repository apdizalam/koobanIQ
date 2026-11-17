import type { Language } from '../i18n/language';

/** The public user the API returns (backend models/User.ts toPublicUser). */
export interface PublicUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  preferredLanguage: Language;
  createdAt: string;
}

/** POST /auth/login and /auth/refresh answer. */
export interface Session {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}
