/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { AuthProvider } from '../src/auth/AuthProvider';
import { useAuth, type AuthState } from '../src/auth/authContext';
import i18n from '../src/i18n';

// Secure storage lives on the phone; here it is a plain in-memory map.
const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

const REFRESH_KEY = 'kobaniq.refreshToken';
const USER_KEY = 'kobaniq.user';

// A verified account (unverified accounts are sent to Verify email; see verifyEmail.test.tsx).
const user = (email: string, preferredLanguage = 'en') => ({
  id: 'u1',
  email,
  role: 'user',
  status: 'active',
  emailVerified: true,
  preferredLanguage,
  createdAt: '2026-11-17T00:00:00.000Z',
});

const session = (email: string, refreshToken: string, preferredLanguage = 'en') => ({
  user: user(email, preferredLanguage),
  accessToken: `access-for-${refreshToken}`,
  accessTokenExpiresIn: 900,
  refreshToken,
  refreshTokenExpiresAt: '2026-12-17T00:00:00.000Z',
});

type Reply = { status: number; body?: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });
const fail = (status: number, code: string): Reply => ({
  status,
  body: { data: null, error: { code, message: code } },
});

/** Fake API: answers by "METHOD /path"; records every call; can hold a reply until released. */
let routes: Record<string, Reply | 'offline'> = {};
const calls: { route: string; body: unknown }[] = [];
let hold: Promise<void> | null = null;

beforeEach(() => {
  mockSecureStore.clear();
  calls.length = 0;
  routes = {};
  hold = null;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const route = `${init.method ?? 'GET'} ${new URL(url).pathname.replace('/api/v1', '')}`;
    calls.push({ route, body: init.body ? JSON.parse(init.body as string) : undefined });
    if (hold) await hold;
    const reply = routes[route];
    if (!reply || reply === 'offline') throw new TypeError('Network request failed');
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
    } as Response;
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

/** A phone that was signed in before the app was closed. */
const savedSession = (refreshToken = 'saved-1', email = 'amina@example.com') => {
  mockSecureStore.set(REFRESH_KEY, refreshToken);
  mockSecureStore.set(USER_KEY, JSON.stringify(user(email)));
};

const launch = (url = '/') => renderRouter('./src/app', { initialUrl: url });
const refreshCalls = () => calls.filter((c) => c.route === 'POST /auth/refresh');

describe('App start (TIQ-5 slice 3)', () => {
  it('nobody signed in: opens Welcome without calling the server', async () => {
    await launch();
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
    expect(screen).toHavePathname('/welcome');
    expect(calls).toHaveLength(0);
  });

  it('restart keeps the user signed in: swaps the saved token once and opens Home', async () => {
    savedSession('saved-1');
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2'));
    await launch();

    expect(await screen.findByTestId('home-name')).toHaveTextContent('amina');
    expect(screen).toHavePathname('/home');
    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0].body).toEqual({ refreshToken: 'saved-1' });
    // Single-use tokens: the new one replaces the old one.
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('rotated-2');
  });

  it('uses the language saved on the account', async () => {
    savedSession();
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2', 'so'));
    await launch();
    await screen.findByTestId('home-name');
    expect(i18n.language).toBe('so');
  });

  it('shows the splash, not Welcome, while the session is checked', async () => {
    savedSession();
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2'));
    let release: () => void = () => undefined;
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await launch();
    expect(await screen.findByTestId('splash')).toBeTruthy();
    expect(screen.queryByTestId('welcome-start')).toBeNull();
    await act(async () => release());
    expect(await screen.findByTestId('home-name')).toBeTruthy();
  });

  it.each([
    [401, 'INVALID_REFRESH_TOKEN'],
    [401, 'REFRESH_TOKEN_REUSED'],
    [403, 'ACCOUNT_SUSPENDED'],
  ])('session ended (%i %s): forgets it and opens Welcome', async (status, code) => {
    savedSession();
    routes['POST /auth/refresh'] = fail(status, code);
    await launch();
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
    expect(mockSecureStore.has(REFRESH_KEY)).toBe(false);
    expect(mockSecureStore.has(USER_KEY)).toBe(false);
  });

  it('offline at launch: stays signed in with the saved account and keeps the token', async () => {
    savedSession('saved-1', 'amina@example.com');
    routes['POST /auth/refresh'] = 'offline';
    await launch();
    expect(await screen.findByTestId('home-name')).toHaveTextContent('amina');
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('saved-1');
  });

  it('server error at launch with no saved account: opens Welcome but keeps the token', async () => {
    mockSecureStore.set(REFRESH_KEY, 'saved-1');
    routes['POST /auth/refresh'] = fail(500, 'INTERNAL');
    await launch();
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('saved-1');
  });

  it('a signed-in user who opens Welcome goes to Home', async () => {
    savedSession();
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2'));
    await launch('/welcome');
    expect(await screen.findByTestId('home-name')).toBeTruthy();
    expect(screen).toHavePathname('/home');
  });

  it('log out, then restart: opens Welcome', async () => {
    savedSession();
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2'));
    routes['POST /auth/logout'] = { status: 204 };
    await launch();
    await screen.findByTestId('home-name');
    await act(async () => {
      fireEvent.press(screen.getByTestId('tab-profile'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-logout'));
    });
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
    expect(mockSecureStore.has(REFRESH_KEY)).toBe(false);

    // "Close the app": tear down with the library's cleanup (a manual unmount
    // leaves the renderer in a state that breaks later renders in this file).
    await cleanup();
    calls.length = 0;
    await launch();
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('getAccessToken', () => {
  /** Renders the provider and hands back its live state. */
  async function mountAuth() {
    const box: { auth: AuthState | null } = { auth: null };
    function Probe() {
      const auth = useAuth();
      useEffect(() => {
        box.auth = auth;
      });
      return null;
    }
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    return box;
  }

  it('reuses the access token while it is valid (no extra refresh)', async () => {
    savedSession('saved-1');
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2'));
    const box = await mountAuth();
    await act(async () => undefined);
    expect(box.auth?.status).toBe('signedIn');
    const token = await box.auth?.getAccessToken();
    expect(token).toBe('access-for-rotated-2');
    expect(refreshCalls()).toHaveLength(1); // only the launch refresh
  });

  it('refreshes once when several calls need a new token at the same time', async () => {
    // Offline launch: signed in from the saved account, but no access token yet.
    savedSession('saved-1');
    routes['POST /auth/refresh'] = 'offline';
    const box = await mountAuth();
    await act(async () => undefined);
    expect(box.auth?.status).toBe('signedIn');

    // Back online: three requests ask for a token together.
    calls.length = 0;
    routes['POST /auth/refresh'] = ok(session('amina@example.com', 'rotated-2'));
    let tokens: (string | undefined)[] = [];
    await act(async () => {
      tokens = await Promise.all([
        box.auth?.getAccessToken(),
        box.auth?.getAccessToken(),
        box.auth?.getAccessToken(),
      ]);
    });
    expect(tokens).toEqual([
      'access-for-rotated-2',
      'access-for-rotated-2',
      'access-for-rotated-2',
    ]);
    // One request with the saved token: sending it twice would trip the server's reuse check.
    expect(refreshCalls()).toHaveLength(1);
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('rotated-2');
  });

  it('signs the user out when the server ends the session', async () => {
    savedSession('saved-1');
    routes['POST /auth/refresh'] = 'offline';
    const box = await mountAuth();
    await act(async () => undefined);

    routes['POST /auth/refresh'] = fail(401, 'REFRESH_TOKEN_REUSED');
    await act(async () => {
      await expect(box.auth?.getAccessToken()).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_REUSED',
      });
    });
    expect(box.auth?.status).toBe('signedOut');
    expect(mockSecureStore.has(REFRESH_KEY)).toBe(false);
  });
});
