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

const EMAIL = 'new@example.com';

beforeEach(() => {
  mockSecureStore.clear();
  resetFakeApi();
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

/** Signs up a new (unverified) account and lands on Verify email. */
async function signUp(language = 'en') {
  routes['POST /auth/register'] = ok({ user: user(EMAIL, language, false) }, 201);
  routes['POST /auth/login'] = ok(session(EMAIL, language, false));
  await renderApp('/sign-up');
  await type('sign-up-email', EMAIL);
  await type('sign-up-password', 'secret123');
  await press('sign-up-age');
  await press('sign-up-submit');
}

/** A phone that was signed in, with an account whose email isn't confirmed yet. */
function savedUnverifiedSession() {
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  routes['POST /auth/refresh'] = ok(session(EMAIL, 'en', false));
}

describe('Verify email (TIQ-5 slice 4)', () => {
  it('End Test (Somali): sign-up → verify → Home', async () => {
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    await signUp('so');
    expect(screen).toHavePathname('/verify-email');
    expect(screen.getByText('Hubi iimaylkaaga')).toBeTruthy();
    expect(screen.getByText(new RegExp(EMAIL.replace('.', '\\.')))).toBeTruthy();
    // A code was just emailed, so "send a new code" waits a minute.
    expect(screen.getByTestId('verify-wait')).toBeTruthy();

    routes['POST /auth/verify-email'] = ok({ user: user(EMAIL, 'so', true) });
    await type('verify-code', '12 34 56');
    await press('verify-submit');

    // (Home then loads the account with GET /me, so look for the verify call itself.)
    expect(calls.find((c) => c.route === 'POST /auth/verify-email')).toMatchObject({
      body: { email: EMAIL, code: '123456' },
    });
    expect(screen).toHavePathname('/home');
    expect(JSON.parse(mockSecureStore.get('kobaniq.user') ?? '{}').emailVerified).toBe(true);
  });

  it('checks the code format before calling the server', async () => {
    await signUp();
    const before = calls.length;
    await type('verify-code', '12345');
    await press('verify-submit');
    expect(screen.getByText('Enter the 6-digit code from the email.')).toBeTruthy();
    expect(calls).toHaveLength(before);
  });

  it('a wrong code shows a message and stays on the screen', async () => {
    await signUp();
    routes['POST /auth/verify-email'] = fail(400, 'INVALID_CODE');
    await type('verify-code', '000000');
    await press('verify-submit');
    expect(screen.getByText('The code is wrong or has expired. Ask for a new one.')).toBeTruthy();
    expect(screen).toHavePathname('/verify-email');
  });

  it('too many wrong codes asks for a new one', async () => {
    await signUp();
    routes['POST /auth/verify-email'] = fail(429, 'TOO_MANY_ATTEMPTS');
    await type('verify-code', '000000');
    await press('verify-submit');
    expect(screen.getByText('Too many wrong codes. Ask for a new one.')).toBeTruthy();
  });

  it('after a restart an unverified account opens Verify email and can ask for a new code', async () => {
    savedUnverifiedSession();
    routes['POST /auth/verify-email/resend'] = { status: 204 };
    await renderApp('/');
    expect(await screen.findByTestId('verify-code')).toBeTruthy();
    expect(screen).toHavePathname('/verify-email');

    await press('verify-resend');
    expect(calls.at(-1)).toMatchObject({
      route: 'POST /auth/verify-email/resend',
      body: { email: EMAIL },
    });
    expect(
      screen.getByText('A new code is on its way. Check your inbox and spam folder.'),
    ).toBeTruthy();
    expect(screen.getByTestId('verify-wait')).toBeTruthy();
    expect(screen.queryByTestId('verify-resend')).toBeNull();
  });

  it('an unverified account cannot open Home', async () => {
    savedUnverifiedSession();
    await renderApp('/home');
    expect(await screen.findByTestId('verify-code')).toBeTruthy();
    expect(screen).toHavePathname('/verify-email');
  });

  it('"Wrong email? Log out" returns to Welcome', async () => {
    routes['POST /auth/logout'] = { status: 204 };
    await signUp();
    await press('verify-logout');
    expect(screen).toHavePathname('/welcome');
    expect(mockSecureStore.has('kobaniq.refreshToken')).toBe(false);
  });

  it('the back button leaves the unconfirmed account and opens Sign up', async () => {
    routes['POST /auth/logout'] = { status: 204 };
    await signUp();
    await press('back');
    expect(await screen.findByTestId('sign-up-submit')).toBeTruthy();
    expect(screen).toHavePathname('/sign-up');
    expect(mockSecureStore.has('kobaniq.refreshToken')).toBe(false);
    expect(calls.some((c) => c.route === 'POST /auth/logout')).toBe(true);
  });

  it('a signed-out visitor is sent to Welcome', async () => {
    await renderApp('/verify-email');
    expect(await screen.findByTestId('welcome-start')).toBeTruthy();
  });
});
