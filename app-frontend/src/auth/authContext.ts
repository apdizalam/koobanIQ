import { createContext, useContext } from 'react';
import type { Language } from '../i18n/language';
import type { PublicUser } from '../types/auth';

/**
 * restoring  — app just started; checking the saved session (no screen decision yet)
 * signedIn   — a user is signed in
 * signedOut  — nobody is signed in
 */
export type AuthStatus = 'restoring' | 'signedIn' | 'signedOut';

export interface AuthState {
  status: AuthStatus;
  /** The signed-in user, or null. */
  user: PublicUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account in the current app language, then signs in. */
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * A valid access token for API calls. Refreshes it (once, even if several
   * calls ask at the same time) when it is missing or about to expire.
   * Signs the user out if the session is no longer valid.
   */
  getAccessToken: () => Promise<string>;
  /** Confirms the signed-in user's email with the emailed code. */
  verifyEmail: (code: string) => Promise<void>;
  /** Emails the signed-in user a new verification code. */
  resendVerification: () => Promise<void>;
  /** Loads the account again from the server (GET /me) and keeps it for offline starts. */
  reloadUser: () => Promise<PublicUser>;
  /**
   * Switches the app language at once and saves it to the account (PATCH /me),
   * so it follows the user to any device. Throws if saving fails; the screen
   * language is changed either way.
   */
  saveLanguage: (language: Language) => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
