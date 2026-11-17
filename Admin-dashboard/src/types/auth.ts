/** The public user the API returns (backend models/User.ts toPublicUser). */
export interface PublicUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  preferredLanguage: 'en' | 'so';
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
