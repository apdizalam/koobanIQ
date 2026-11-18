/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
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

// Accounts are verified unless a test says otherwise (unverified accounts go to Verify email).
const user = (email: string, preferredLanguage = 'en', emailVerified = true) => ({
  id: 'u1',
  email,
  role: 'user',
  status: 'active',
  emailVerified,
  preferredLanguage,
  createdAt: '2026-11-17T00:00:00.000Z',
});

const session = (email: string, preferredLanguage = 'en', emailVerified = true) => ({
  user: user(email, preferredLanguage, emailVerified),
  accessToken: 'access-1',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2026-12-17T00:00:00.000Z',
});

type Reply = { status: number; body?: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });
const fail = (status: number, code: string): Reply => ({
  status,
  body: { data: null, error: { code, message: code } },
});

/** Fake API: answers by "METHOD /path"; records every call. */
let routes: Record<string, Reply | 'offline'> = {};
const calls: { route: string; body: unknown; headers: Record<string, string> }[] = [];

beforeEach(() => {
  mockSecureStore.clear();
  calls.length = 0;
  routes = {};
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const route = `${init.method ?? 'GET'} ${new URL(url).pathname.replace('/api/v1', '')}`;
    calls.push({
      route,
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers as Record<string, string>,
    });
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

const renderApp = (initialUrl: string) => renderRouter('./src/app', { initialUrl });

const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });

const type = (testID: string, text: string) =>
  act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });

describe('Log in', () => {
  it('checks the form before calling the server', async () => {
    await renderApp('/login');
    await type('login-email', 'not-an-email');
    await press('login-submit');
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('shows "incorrect" under the form for a wrong password and stays on Log in', async () => {
    routes['POST /auth/login'] = fail(401, 'INVALID_CREDENTIALS');
    await renderApp('/login');
    await type('login-email', 'amina@example.com');
    await type('login-password', 'wrong-password');
    await press('login-submit');
    expect(screen.getByText('Email or password is incorrect.')).toBeTruthy();
    expect(screen).toHavePathname('/login');
    expect(mockSecureStore.has(REFRESH_KEY)).toBe(false);
  });

  it('says when the server cannot be reached', async () => {
    routes['POST /auth/login'] = 'offline';
    await renderApp('/login');
    await type('login-email', 'amina@example.com');
    await type('login-password', 'secret123');
    await press('login-submit');
    expect(
      screen.getByText('Cannot reach the server. Check your internet connection.'),
    ).toBeTruthy();
  });

  it('signs in: keeps the refresh token in secure storage and opens Home', async () => {
    routes['POST /auth/login'] = ok(session('amina@example.com'));
    await renderApp('/login');
    await type('login-email', '  amina@example.com ');
    await type('login-password', 'secret123');
    await press('login-submit');

    expect(calls[0]).toMatchObject({
      route: 'POST /auth/login',
      body: { email: 'amina@example.com', password: 'secret123' },
    });
    expect(screen).toHavePathname('/home');
    expect(screen.getByTestId('home-email')).toHaveTextContent(/amina@example\.com/);
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('refresh-1');
  });

  it("switches to the account's saved language after signing in", async () => {
    routes['POST /auth/login'] = ok(session('amina@example.com', 'so'));
    await renderApp('/login');
    await type('login-email', 'amina@example.com');
    await type('login-password', 'secret123');
    await press('login-submit');
    expect(i18n.language).toBe('so');
  });

  it('Google says it comes later (Forgot password is tested in passwordReset.test.tsx)', async () => {
    await renderApp('/login');
    await press('login-google');
    expect(screen.getByText('Google sign-in arrives in a later update.')).toBeTruthy();
  });
});

describe('Sign up', () => {
  it('asks for at least 8 characters', async () => {
    await renderApp('/sign-up');
    await type('sign-up-email', 'new@example.com');
    await type('sign-up-password', 'short');
    await press('sign-up-submit');
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('shows "already exists" on the email field', async () => {
    routes['POST /auth/register'] = fail(409, 'EMAIL_TAKEN');
    await renderApp('/sign-up');
    await type('sign-up-email', 'amina@example.com');
    await type('sign-up-password', 'secret123');
    await press('sign-up-submit');
    expect(
      screen.getByText('An account with this email already exists. Log in instead.'),
    ).toBeTruthy();
    expect(screen).toHavePathname('/sign-up');
  });

  it('creates the account in the chosen language, signs in and opens Verify email', async () => {
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    routes['POST /auth/register'] = ok({ user: user('new@example.com', 'so', false) }, 201);
    routes['POST /auth/login'] = ok(session('new@example.com', 'so', false));
    await renderApp('/sign-up');
    await type('sign-up-email', 'new@example.com');
    await type('sign-up-password', 'secret123');
    await press('sign-up-submit');

    expect(calls.map((c) => c.route)).toEqual(['POST /auth/register', 'POST /auth/login']);
    expect(calls[0].body).toEqual({
      email: 'new@example.com',
      password: 'secret123',
      preferredLanguage: 'so',
    });
    expect(calls[0].headers['Accept-Language']).toBe('so');
    // User Flow: sign-up → verify the emailed code → Home.
    expect(screen).toHavePathname('/verify-email');
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('refresh-1');
  });
});

describe('signed-in area', () => {
  it('sends signed-out visitors from Home to Welcome', async () => {
    await renderApp('/home');
    expect(screen).toHavePathname('/welcome');
  });

  it('Log out forgets the token, tells the server and returns to Welcome', async () => {
    routes['POST /auth/login'] = ok(session('amina@example.com'));
    routes['POST /auth/logout'] = { status: 204 };
    await renderApp('/login');
    await type('login-email', 'amina@example.com');
    await type('login-password', 'secret123');
    await press('login-submit');
    // Log out lives on the Profile tab.
    await press('tab-profile');
    await press('profile-logout');

    expect(screen).toHavePathname('/welcome');
    expect(mockSecureStore.has(REFRESH_KEY)).toBe(false);
    expect(calls.at(-1)).toMatchObject({
      route: 'POST /auth/logout',
      body: { refreshToken: 'refresh-1' },
    });
  });
});
