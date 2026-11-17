import { createContext, useContext } from 'react';
import type { PublicUser } from '../types/auth';

export interface AuthState {
  /** True while a stored session is being restored after a page load. */
  restoring: boolean;
  /** The signed-in admin, or null. */
  user: PublicUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** API call as the signed-in admin (refreshes an expired access token once). */
  request: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
