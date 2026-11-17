import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicUser } from '../types/auth';
import { AuthContext, type AuthState } from './authContext';
import { browserStorage, createSessionManager } from './sessionManager';
import { signInAdmin } from './signInAdmin';

/** Holds the signed-in admin and keeps the session alive across reloads. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [restoring, setRestoring] = useState(() => browserStorage.get() !== null);
  // When a refresh fails the session ends; clearing `user` lets the guard send us to /login.
  const [manager] = useState(() => createSessionManager(browserStorage, () => setUser(null)));

  useEffect(() => {
    if (!restoring) return;
    let active = true;
    // restore() is shared, so React's double effect in development still refreshes only once.
    void manager.restore().then((restored) => {
      if (!active) return;
      setUser(restored);
      setRestoring(false);
    });
    return () => {
      active = false;
    };
  }, [manager, restoring]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await signInAdmin(email, password);
      manager.start(session);
      setUser(session.user);
    },
    [manager],
  );

  const signOut = useCallback(async () => {
    setUser(null);
    await manager.signOut();
  }, [manager]);

  const value = useMemo<AuthState>(
    () => ({ restoring, user, signIn, signOut, request: manager.request }),
    [restoring, user, signIn, signOut, manager],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
