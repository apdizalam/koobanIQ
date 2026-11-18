/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import i18n from '../src/i18n';
import { calls, fail, ok, resetFakeApi, routes, session, user } from './support/fakeApi';

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

const EMAIL = 'amina@example.com';

beforeEach(() => {
  mockSecureStore.clear();
  resetFakeApi();
  // A saved session: the app opens signed in (TIQ-5 slice 3).
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  routes['POST /auth/refresh'] = ok(session(EMAIL));
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function openApp(url = '/home') {
  await act(async () => {
    renderRouter('./src/app', { initialUrl: url });
  });
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe('TIQ-7 End Test: bottom navigation', () => {
  it('each of the 5 tabs opens with no errors', async () => {
    routes['GET /me'] = ok({ user: user(EMAIL) });
    await openApp();
    expect(await screen.findByTestId('home-screen')).toBeTruthy();

    for (const [tab, path] of [
      ['cv', '/cv'],
      ['jobs', '/jobs'],
      ['reports', '/reports'],
      ['profile', '/profile'],
      ['home', '/home'],
    ] as const) {
      await press(`tab-${tab}`);
      expect(await screen.findByTestId(`${tab}-screen`)).toBeTruthy();
      expect(screen).toHavePathname(path);
    }
  });

  it('tab names follow the app language', async () => {
    routes['GET /me'] = ok({ user: user(EMAIL) });
    await openApp();
    await screen.findByTestId('home-screen');
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    expect(screen.getByText('Shaqooyin')).toBeTruthy();
    expect(screen.getByText('Astaanta')).toBeTruthy();
  });
});

describe('TIQ-7 End Test: Home states', () => {
  it('shows loading, then the account from the API (GET /me), and empty states — no sample data', async () => {
    let answer: (() => void) | undefined;
    routes['GET /me'] = ok({ user: { ...user(EMAIL), preferredLanguage: 'en' } });
    // Hold the GET /me answer to see the loading state first.
    const realFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/me')) await new Promise<void>((r) => (answer = r));
      return realFetch(url, init);
    }) as unknown as typeof fetch;

    await openApp();
    expect(await screen.findByTestId('home-loading')).toBeTruthy();
    expect(screen.queryByTestId('home-account')).toBeNull();

    await act(async () => {
      answer?.();
    });
    expect(await screen.findByTestId('home-account')).toBeTruthy();
    expect(screen.queryByTestId('home-loading')).toBeNull();
    expect(screen.getByText(/Member since/)).toBeTruthy();
    expect(
      screen.getByText('No job matches yet. Start a job search to see jobs that fit you.'),
    ).toBeTruthy();
    expect(screen.getByTestId('home-cvs')).toBeTruthy();
    expect(calls.some((c) => c.route === 'GET /me')).toBe(true);
  });

  it('shows an error with Try again when the server cannot be reached, then recovers', async () => {
    routes['GET /me'] = 'offline';
    await openApp();
    expect(await screen.findByTestId('home-error')).toBeTruthy();
    expect(
      screen.getByText('Cannot reach the server. Check your internet connection.'),
    ).toBeTruthy();

    routes['GET /me'] = ok({ user: user(EMAIL) });
    await press('home-retry');
    expect(await screen.findByTestId('home-account')).toBeTruthy();
    expect(screen.queryByTestId('home-error')).toBeNull();
  });

  it('shows the general error for a server failure', async () => {
    routes['GET /me'] = fail(500, 'INTERNAL_ERROR');
    await openApp();
    expect(
      await screen.findByText('Your overview could not be loaded. Please try again.'),
    ).toBeTruthy();
  });

  it('a card action opens its tab', async () => {
    routes['GET /me'] = ok({ user: user(EMAIL) });
    await openApp();
    await screen.findByTestId('home-account');
    await press('home-matches-action');
    expect(await screen.findByTestId('jobs-screen')).toBeTruthy();
    expect(screen).toHavePathname('/jobs');
  });
});

describe('Profile tab: language saved to the account (FR-I18N-02/04)', () => {
  it('switching to Somali changes the app at once and saves it with PATCH /me', async () => {
    routes['GET /me'] = ok({ user: user(EMAIL) });
    routes['PATCH /me'] = ok({ user: user(EMAIL, 'so') });
    await openApp('/profile');
    await screen.findByTestId('profile-screen');

    await press('language-so');
    expect(i18n.language).toBe('so');
    expect(await screen.findByTestId('profile-language-saved')).toBeTruthy();
    expect(calls.find((c) => c.route === 'PATCH /me')?.body).toEqual({ preferredLanguage: 'so' });
    expect(JSON.parse(mockSecureStore.get('kobaniq.user') ?? '{}').preferredLanguage).toBe('so');
  });

  it('if saving fails, the phone still switches and the user is told it was not saved', async () => {
    routes['GET /me'] = ok({ user: user(EMAIL) });
    routes['PATCH /me'] = 'offline';
    await openApp('/profile');
    await screen.findByTestId('profile-screen');

    await press('language-so');
    expect(i18n.language).toBe('so');
    expect(await screen.findByTestId('profile-language-error')).toBeTruthy();
  });

  it('Log out returns to Welcome', async () => {
    routes['GET /me'] = ok({ user: user(EMAIL) });
    routes['POST /auth/logout'] = { status: 204 };
    await openApp('/profile');
    expect(await screen.findByTestId('profile-email')).toHaveTextContent(EMAIL);
    await press('profile-logout');
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
    expect(mockSecureStore.has('kobaniq.refreshToken')).toBe(false);
  });
});
