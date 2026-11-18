import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../i18n/language';
import { ApiError } from '../services/api';
import {
  login,
  logout,
  refresh,
  register,
  resendVerification as resendVerificationRequest,
  verifyEmail as verifyEmailRequest,
} from '../services/authApi';
import type { PublicUser, Session } from '../types/auth';
import { AuthContext, type AuthState, type AuthStatus } from './authContext';
import { tokenStore, userStore } from './tokenStore';

/** Refresh a little early so a token never expires in the middle of a request. */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * The server says this session is over (expired, revoked, reused or the account
 * is suspended). Network errors and server outages are not: the session may
 * still be fine, so the user stays signed in and we try again later.
 */
const sessionEnded = (err: unknown): boolean =>
  err instanceof ApiError && (err.status === 401 || err.status === 403);

/**
 * Holds the signed-in user. Refresh token (and the public user, for offline
 * launches) in secure storage; access token in memory only.
 *
 * On launch the saved refresh token is exchanged for a new pair, so a restart
 * keeps the user signed in. Refresh tokens are single-use on the server
 * (reusing one ends every session), so only one refresh ever runs at a time.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const access = useRef<{ token: string; expiresAt: number } | null>(null);
  const refreshing = useRef<Promise<Session> | null>(null);

  const currentLanguage = useCallback(
    (): Language => (isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE),
    [i18n],
  );

  /** Saves a new session. The account's saved language is used (it follows the user to any device). */
  const start = useCallback(
    async (session: Session) => {
      access.current = {
        token: session.accessToken,
        expiresAt: Date.now() + session.accessTokenExpiresIn * 1000,
      };
      await tokenStore.set(session.refreshToken);
      await userStore.set(session.user);
      if (session.user.preferredLanguage !== currentLanguage()) {
        await i18n.changeLanguage(session.user.preferredLanguage);
      }
      setUser(session.user);
      setStatus('signedIn');
    },
    [i18n, currentLanguage],
  );

  /** Forgets the session on this phone (does not call the server). */
  const clearLocal = useCallback(async () => {
    access.current = null;
    setUser(null);
    setStatus('signedOut');
    await tokenStore.clear();
    await userStore.clear();
  }, []);

  /** Exchanges the saved refresh token for a new pair; concurrent callers share one request. */
  const refreshSession = useCallback((): Promise<Session> => {
    if (!refreshing.current) {
      refreshing.current = (async () => {
        const stored = await tokenStore.get();
        if (!stored) {
          throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'No saved session');
        }
        const session = await refresh(stored);
        await start(session);
        return session;
      })().finally(() => {
        refreshing.current = null;
      });
    }
    return refreshing.current;
  }, [start]);

  // App start: restore the saved session.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!(await tokenStore.get())) {
        if (active) setStatus('signedOut');
        return;
      }
      try {
        await refreshSession();
      } catch (err) {
        if (sessionEnded(err)) {
          await clearLocal();
          return;
        }
        // Offline or server trouble: keep the saved session and open signed in
        // with the last known account; the next API call refreshes again.
        const cached = await userStore.get();
        if (!active) return;
        if (cached) {
          setUser(cached);
          setStatus('signedIn');
        } else {
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshSession, clearLocal]);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const current = access.current;
    if (current && current.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return current.token;
    try {
      return (await refreshSession()).accessToken;
    } catch (err) {
      if (sessionEnded(err)) await clearLocal();
      throw err;
    }
  }, [refreshSession, clearLocal]);

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
    await clearLocal();
    if (stored) await logout(stored).catch(() => undefined);
  }, [clearLocal]);

  const verifyEmail = useCallback(
    async (code: string) => {
      if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Not signed in');
      const { user: verified } = await verifyEmailRequest(user.email, code);
      await userStore.set(verified);
      setUser(verified);
    },
    [user],
  );

  const resendVerification = useCallback(async () => {
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Not signed in');
    await resendVerificationRequest(user.email);
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signOut,
      getAccessToken,
      verifyEmail,
      resendVerification,
    }),
    [status, user, signIn, signUp, signOut, getAccessToken, verifyEmail, resendVerification],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
