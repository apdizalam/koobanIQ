import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../i18n/language';
import type { PublicUser } from '../types/auth';
import { AuthContext, type AuthState } from './authContext';
import { decideLanguageOnSignIn, takeLanguageChosenWhileSignedOut } from './languageSync';
import { browserStorage, createSessionManager } from './sessionManager';
import { signInAdmin } from './signInAdmin';

/** Holds the signed-in admin, keeps the session alive and keeps the language in sync. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [restoring, setRestoring] = useState(() => browserStorage.get() !== null);
  // When a refresh fails the session ends; clearing `user` lets the guard send us to /login.
  const [manager] = useState(() => createSessionManager(browserStorage, () => setUser(null)));

  /** Signed in: the account language wins, unless one was just picked on the login page. */
  const enter = useCallback(
    async (signedIn: PublicUser, pickedOnLoginPage: boolean) => {
      const current: Language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
      const decision = decideLanguageOnSignIn(
        current,
        signedIn.preferredLanguage,
        pickedOnLoginPage,
      );
      if (decision.action === 'adopt') await i18n.changeLanguage(decision.language);
      // For 'save', the effect below sends PATCH /me because the languages differ.
      setUser(signedIn);
    },
    [i18n],
  );

  useEffect(() => {
    if (!restoring) return;
    let active = true;
    // restore() is shared, so React's double effect in development still refreshes only once.
    void manager.restore().then(async (restored) => {
      if (!active) return;
      if (restored) await enter(restored, false);
      setRestoring(false);
    });
    return () => {
      active = false;
    };
  }, [manager, restoring, enter]);

  // While signed in, a language switch is saved to the account (PATCH /me).
  const language = i18n.language;
  useEffect(() => {
    if (!user || !isLanguage(language) || language === user.preferredLanguage) return;
    let active = true;
    manager
      .request<{ user: PublicUser }>('/me', {
        method: 'PATCH',
        body: { preferredLanguage: language },
      })
      .then((res) => active && setUser(res.user))
      .catch((err: unknown) => console.warn('Could not save the language to the account', err));
    return () => {
      active = false;
    };
  }, [user, language, manager]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await signInAdmin(email, password);
      manager.start(session);
      await enter(session.user, takeLanguageChosenWhileSignedOut());
    },
    [manager, enter],
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
