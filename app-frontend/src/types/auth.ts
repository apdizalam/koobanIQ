import type { Language } from '../i18n/language';

/** The public user the API returns (backend models/User.ts toPublicUser). */
export interface PublicUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  /**
   * Show the confirm-email step (server switch EMAIL_VERIFICATION_REQUIRED on and the
   * email not confirmed). Missing (older server) = no step.
   */
  mustVerifyEmail?: boolean;
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
