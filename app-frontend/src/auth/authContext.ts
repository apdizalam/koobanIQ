import { createContext, useContext } from 'react';
import type { PublicUser } from '../types/auth';

export interface AuthState {
  /** The signed-in user, or null. */
  user: PublicUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account in the current app language, then signs in. */
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
