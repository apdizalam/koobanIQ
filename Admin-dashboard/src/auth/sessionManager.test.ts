import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../constants/api';
import type { PublicUser, Session } from '../types/auth';
import { createSessionManager, type TokenStorage } from './sessionManager';

const user: PublicUser = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
  emailVerified: false,
  preferredLanguage: 'en',
  createdAt: '2026-11-17T00:00:00.000Z',
};

function sessionFor(n: number): Session {
  return {
    user,
    accessToken: `access-${n}`,
    accessTokenExpiresIn: 900,
    refreshToken: `refresh-${n}`,
    refreshTokenExpiresAt: '2026-12-17T00:00:00.000Z',
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const ok = (data: unknown) => json(200, { data, error: null, meta: {} });
const fail = (status: number, code: string) =>
  json(status, { data: null, error: { code, message: code }, meta: {} });

function memoryStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  return {
    value: initial,
    get() {
      return this.value;
    },
    set(token) {
      this.value = token;
    },
    clear() {
      this.value = null;
    },
  };
}

/**
 * Fake API. /auth/refresh accepts only the current refresh token (like the
 * real server) and answers after a short delay, so overlapping calls overlap.
 */
function fakeApi(opts: { validRefresh?: string | null; expiredAccess?: string[] } = {}) {
  let valid = opts.validRefresh ?? null;
  let next = 2;
  const expired = new Set(opts.expiredAccess ?? []);
  const calls: string[] = [];

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(API_BASE_URL, '');
    calls.push(path);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
    const token = auth.replace('Bearer ', '');

    if (path === '/auth/refresh') {
      await new Promise((r) => setTimeout(r, 5));
      const { refreshToken } = JSON.parse(init!.body as string);
      if (refreshToken !== valid) return fail(401, 'REFRESH_TOKEN_REUSED');
      const session = sessionFor(next++);
      valid = session.refreshToken;
      return ok(session);
    }
    if (path === '/auth/logout') return new Response(null, { status: 204 });
    if (path === '/admin/access' || path === '/admin/thing') {
      if (expired.has(token)) return fail(401, 'TOKEN_EXPIRED');
      return ok({ access: true, user, token });
    }
    if (path === '/admin/broken') return fail(500, 'INTERNAL_ERROR');
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('restore (after a page reload)', () => {
  it('does nothing when no refresh token is stored', async () => {
    const api = fakeApi();
    const manager = createSessionManager(memoryStorage(), vi.fn());
    await expect(manager.restore()).resolves.toBeNull();
    expect(api.calls).toEqual([]);
  });

  it('signs back in with the stored refresh token and stores the new one', async () => {
    const api = fakeApi({ validRefresh: 'refresh-1' });
    const storage = memoryStorage('refresh-1');
    const manager = createSessionManager(storage, vi.fn());

    await expect(manager.restore()).resolves.toEqual(user);
    expect(api.calls).toEqual(['/auth/refresh', '/admin/access']);
    expect(storage.value).toBe('refresh-2');
  });

  it('refreshes only once when restore is called twice at the same time', async () => {
    const api = fakeApi({ validRefresh: 'refresh-1' });
    const manager = createSessionManager(memoryStorage('refresh-1'), vi.fn());

    const [a, b] = await Promise.all([manager.restore(), manager.restore()]);
    expect(a).toEqual(user);
    expect(b).toEqual(user);
    expect(api.calls.filter((c) => c === '/auth/refresh')).toHaveLength(1);
  });

  it('forgets a refresh token the server no longer accepts', async () => {
    fakeApi({ validRefresh: 'something-else' });
    const storage = memoryStorage('refresh-old');
    const manager = createSessionManager(storage, vi.fn());

    await expect(manager.restore()).resolves.toBeNull();
    expect(storage.value).toBeNull();
  });
});

describe('request (signed-in API calls)', () => {
  it('refreshes an expired access token silently and retries once', async () => {
    const api = fakeApi({ validRefresh: 'refresh-1', expiredAccess: ['access-1'] });
    const storage = memoryStorage();
    const manager = createSessionManager(storage, vi.fn());
    manager.start(sessionFor(1));

    await expect(manager.request('/admin/thing')).resolves.toMatchObject({ token: 'access-2' });
    expect(api.calls).toEqual(['/admin/thing', '/auth/refresh', '/admin/thing']);
    expect(storage.value).toBe('refresh-2');
  });

  it('uses one refresh for several calls that expire at the same time', async () => {
    const api = fakeApi({ validRefresh: 'refresh-1', expiredAccess: ['access-1'] });
    const manager = createSessionManager(memoryStorage(), vi.fn());
    manager.start(sessionFor(1));

    await Promise.all([
      manager.request('/admin/thing'),
      manager.request('/admin/thing'),
      manager.request('/admin/thing'),
    ]);
    expect(api.calls.filter((c) => c === '/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when the refresh fails (guard then shows the login page)', async () => {
    fakeApi({ validRefresh: 'not-ours', expiredAccess: ['access-1'] });
    const storage = memoryStorage();
    const onEnded = vi.fn();
    const manager = createSessionManager(storage, onEnded);
    manager.start(sessionFor(1));

    await expect(manager.request('/admin/thing')).rejects.toMatchObject({ status: 401 });
    expect(onEnded).toHaveBeenCalledOnce();
    expect(storage.value).toBeNull();
    expect(manager.user).toBeNull();
  });

  it('does not refresh for errors that are not about the token', async () => {
    const api = fakeApi({ validRefresh: 'refresh-1' });
    const manager = createSessionManager(memoryStorage(), vi.fn());
    manager.start(sessionFor(1));

    await expect(manager.request('/admin/broken')).rejects.toMatchObject({ status: 500 });
    expect(api.calls).toEqual(['/admin/broken']);
  });
});

describe('signOut', () => {
  it('revokes the refresh token on the server and forgets it here', async () => {
    const api = fakeApi();
    const storage = memoryStorage();
    const manager = createSessionManager(storage, vi.fn());
    manager.start(sessionFor(1));

    await manager.signOut();
    expect(api.calls).toEqual(['/auth/logout']);
    expect(JSON.parse(api.fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      refreshToken: 'refresh-1',
    });
    expect(storage.value).toBeNull();
    expect(manager.user).toBeNull();
  });
});
