import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { logout as apiLogout } from '../services/authApi';
import type { Session } from '../types/auth';
import { AuthContext, type AuthState } from './authContext';
import { signInAdmin } from './signInAdmin';

/** Holds the signed-in admin's session. Tokens live in memory only (for now). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const signIn = useCallback(async (email: string, password: string) => {
    setSession(await signInAdmin(email, password));
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = session?.refreshToken;
    setSession(null);
    if (refreshToken) await apiLogout(refreshToken).catch(() => undefined);
  }, [session]);

  const value = useMemo<AuthState>(
    () => ({ user: session?.user ?? null, signIn, signOut }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
