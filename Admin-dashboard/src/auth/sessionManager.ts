import { ApiError, apiRequest } from '../services/api';
import { checkAdminAccess, logout, refresh } from '../services/authApi';
import type { PublicUser, Session } from '../types/auth';

const STORAGE_KEY = 'kobaniq.admin.refreshToken';
const LOCK_NAME = 'kobaniq-admin-refresh';

/** Where the refresh token is kept between page loads (localStorage in the browser). */
export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export const browserStorage: TokenStorage = {
  get: () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // Private mode or blocked storage: the session just won't survive a reload.
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

/** Runs `fn` while holding a lock shared by every tab, so two tabs never refresh at once. */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(LOCK_NAME, fn) : fn();
}

const isAuthError = (err: unknown) =>
  err instanceof ApiError &&
  err.status === 401 &&
  ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'AUTH_REQUIRED'].includes(err.code);

/**
 * Keeps the admin signed in:
 * - the access token stays in memory, the refresh token in storage;
 * - after a reload, restore() trades the stored refresh token for a new pair;
 * - request() retries once with a fresh access token when the old one expired;
 * - if refreshing fails, the session ends and onSessionEnded() is called.
 *
 * Refresh tokens work only once (the server ends every session if one is
 * reused), so refreshes are shared: overlapping calls wait for the same one.
 */
export function createSessionManager(storage: TokenStorage, onSessionEnded: () => void) {
  let accessToken: string | null = null;
  let user: PublicUser | null = null;
  let refreshing: Promise<Session> | null = null;
  let restoring: Promise<PublicUser | null> | null = null;

  function start(session: Session) {
    accessToken = session.accessToken;
    user = session.user;
    storage.set(session.refreshToken);
  }

  function clear() {
    accessToken = null;
    user = null;
    storage.clear();
  }

  /** Gets a new token pair using the stored refresh token (one at a time). */
  function refreshSession(): Promise<Session> {
    refreshing ??= withRefreshLock(async () => {
      // Read inside the lock: another tab may have just swapped the token.
      const stored = storage.get();
      if (!stored) throw new ApiError(401, 'NO_SESSION', 'Not signed in');
      const session = await refresh(stored);
      start(session);
      return session;
    }).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  function end() {
    const hadSession = user !== null || storage.get() !== null;
    clear();
    if (hadSession) onSessionEnded();
  }

  return {
    get user() {
      return user;
    },

    /** Call after a successful admin sign-in. */
    start,

    /** After a page load: signs back in from the stored refresh token, if any. */
    restore(): Promise<PublicUser | null> {
      restoring ??= (async () => {
        if (!storage.get()) return null;
        try {
          const session = await refreshSession();
          await checkAdminAccess(session.accessToken);
          return session.user;
        } catch {
          clear();
          return null;
        }
      })().finally(() => {
        restoring = null;
      });
      return restoring;
    },

    /** An API call as the signed-in admin; refreshes the access token once if it expired. */
    async request<T>(path: string, options: { method?: string; body?: unknown } = {}) {
      if (!accessToken) {
        end();
        throw new ApiError(401, 'NO_SESSION', 'Not signed in');
      }
      try {
        return await apiRequest<T>(path, { ...options, accessToken });
      } catch (err) {
        if (!isAuthError(err)) throw err;
        try {
          await refreshSession();
        } catch (refreshErr) {
          end();
          throw refreshErr;
        }
        return apiRequest<T>(path, { ...options, accessToken: accessToken ?? undefined });
      }
    },

    /** Log out: revokes the refresh token on the server, then forgets everything here. */
    async signOut() {
      const stored = storage.get();
      clear();
      if (stored) await logout(stored).catch(() => undefined);
    },
  };
}

export type SessionManager = ReturnType<typeof createSessionManager>;
