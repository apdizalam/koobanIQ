/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import i18n from '../src/i18n';

// The Google page opens in the phone's sign-in browser; here the test decides what it returns.
const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

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
  // Like the server with EMAIL_VERIFICATION_REQUIRED on: unconfirmed accounts confirm first.
  mustVerifyEmail: !emailVerified,
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
  mockOpenAuthSession.mockReset();
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

/** The sign-in browser comes back to the app link with these query parameters. */
const googleReturns = (query: string) =>
  mockOpenAuthSession.mockImplementation(async (_start: string, returnUrl: string) => ({
    type: 'success',
    url: `${returnUrl}?${query}`,
  }));

describe('Continue with Google (TIQ-39)', () => {
  it('opens the server start page with the app link, then signs in and opens Home', async () => {
    googleReturns('code=one-time-code-1234567890');
    routes['POST /auth/google/complete'] = ok(session('amina@gmail.com'));
    await renderApp('/login');
    await press('login-google');

    const [start, returnUrl] = mockOpenAuthSession.mock.calls[0] as [string, string];
    const startUrl = new URL(start);
    expect(startUrl.pathname).toBe('/api/v1/auth/google/start');
    expect(startUrl.searchParams.get('returnUrl')).toBe(returnUrl);
    expect(returnUrl).toMatch(/auth\/google$/);
    expect(calls[0]).toMatchObject({
      route: 'POST /auth/google/complete',
      body: { code: 'one-time-code-1234567890', preferredLanguage: 'en' },
    });
    expect(screen).toHavePathname('/home');
    expect(mockSecureStore.get(REFRESH_KEY)).toBe('refresh-1');
  });

  it('a new Google account confirms "18 or older" on One more step, then gets Home', async () => {
    googleReturns('code=one-time-code-1234567890');
    routes['POST /auth/google/complete'] = fail(400, 'AGE_CONFIRM_REQUIRED');
    await renderApp('/sign-up');
    await press('sign-up-google');
    expect(screen).toHavePathname('/google-age');
    expect(screen.getByText('One more step')).toBeTruthy();

    // Not ticked: nothing is sent.
    await press('google-age-submit');
    expect(
      screen.getByText('KOBANIQ is for adults. Tick the box to confirm you are 18 or older.'),
    ).toBeTruthy();
    expect(calls).toHaveLength(1);

    routes['POST /auth/google/complete'] = ok(session('new@gmail.com', 'en'));
    await press('google-age-check');
    await press('google-age-submit');
    expect(calls[1]).toMatchObject({
      route: 'POST /auth/google/complete',
      body: { code: 'one-time-code-1234567890', ageConfirmed: true },
    });
    expect(screen).toHavePathname('/home');
  });

  it('closing the Google page shows a calm note and stays on Log in', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    await renderApp('/login');
    await press('login-google');
    expect(screen.getByText('Google sign-in was cancelled.')).toBeTruthy();
    expect(screen).toHavePathname('/login');
    expect(calls).toHaveLength(0);
  });

  it('says when Google sign-in is not set up on the server', async () => {
    googleReturns('error=not_configured');
    await renderApp('/login');
    await press('login-google');
    expect(screen.getByText('Google sign-in is not set up yet.')).toBeTruthy();
  });

  it('shows "failed" when the server refuses the code, and "suspended" for a suspended account', async () => {
    googleReturns('code=one-time-code-1234567890');
    routes['POST /auth/google/complete'] = fail(400, 'GOOGLE_SIGN_IN_FAILED');
    await renderApp('/login');
    await press('login-google');
    expect(screen.getByText('Google sign-in failed. Please try again.')).toBeTruthy();

    routes['POST /auth/google/complete'] = fail(403, 'ACCOUNT_SUSPENDED');
    await press('login-google');
    expect(screen).toHavePathname('/login');
    expect(mockSecureStore.has(REFRESH_KEY)).toBe(false);
  });

  it('the return link opening the app directly also finishes the sign-in', async () => {
    routes['POST /auth/google/complete'] = ok(session('amina@gmail.com'));
    await renderApp('/auth/google?code=one-time-code-1234567890');
    expect(calls[0]).toMatchObject({ route: 'POST /auth/google/complete' });
    expect(screen).toHavePathname('/home');
  });

  it('works in Somali', async () => {
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    await renderApp('/login');
    expect(screen.getByText('Ku sii wad Google')).toBeTruthy();
    await press('login-google');
    expect(screen.getByText('Gelitaanka Google waa la joojiyay.')).toBeTruthy();
  });
});
