import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../i18n/language';
import { login, logout, register } from '../services/authApi';
import type { PublicUser, Session } from '../types/auth';
import { AuthContext, type AuthState } from './authContext';
import { tokenStore } from './tokenStore';

/**
 * Holds the signed-in user. Refresh token in secure storage, access token in
 * memory. Restoring the session after an app restart is TIQ-5 slice 3.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<PublicUser | null>(null);
  const accessToken = useRef<string | null>(null);

  const currentLanguage = useCallback(
    (): Language => (isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE),
    [i18n],
  );

  /** After login: the account's saved language is used (it follows the user to any device). */
  const start = useCallback(
    async (session: Session) => {
      accessToken.current = session.accessToken;
      await tokenStore.set(session.refreshToken);
      if (session.user.preferredLanguage !== currentLanguage()) {
        await i18n.changeLanguage(session.user.preferredLanguage);
      }
      setUser(session.user);
    },
    [i18n, currentLanguage],
  );

  const signIn = useCallback(
    async (email: string, password: string) => start(await login(email, password)),
    [start],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      // The language picked during onboarding becomes the account's language.
      await register(email, password, currentLanguage());
      await start(await login(email, password));
    },
    [start, currentLanguage],
  );

  const signOut = useCallback(async () => {
    const stored = await tokenStore.get();
    accessToken.current = null;
    setUser(null);
    await tokenStore.clear();
    if (stored) await logout(stored).catch(() => undefined);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, signIn, signUp, signOut }),
    [user, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
