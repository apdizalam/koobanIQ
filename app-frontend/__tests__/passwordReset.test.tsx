/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { calls, fail, resetFakeApi, routes } from './support/fakeApi';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const EMAIL = 'amina@example.com';

beforeEach(() => {
  resetFakeApi();
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

/** Log in → Forgot password? (email carried over) → Send code → Reset screen. */
async function openReset() {
  routes['POST /auth/forgot'] = { status: 204 };
  await renderApp('/login');
  await type('login-email', EMAIL);
  await press('login-forgot');
  expect(screen).toHavePathname('/forgot-password');
  await press('forgot-submit');
}

describe('Forgot / reset password (TIQ-5 slice 4)', () => {
  it('Log in → Forgot → code + new password → back to Log in with a confirmation', async () => {
    await openReset();
    expect(calls.at(-1)).toMatchObject({ route: 'POST /auth/forgot', body: { email: EMAIL } });
    expect(screen).toHavePathname('/reset-password');
    expect(screen.getByText(/amina@example\.com/)).toBeTruthy();
    // A code was just sent, so "send a new code" waits a minute.
    expect(screen.getByTestId('reset-wait')).toBeTruthy();

    routes['POST /auth/reset'] = { status: 204 };
    await type('reset-code', '654321');
    await type('reset-password', 'new-secret-9');
    await press('reset-submit');

    expect(calls.at(-1)).toMatchObject({
      route: 'POST /auth/reset',
      body: { email: EMAIL, code: '654321', password: 'new-secret-9' },
    });
    expect(screen).toHavePathname('/login');
    expect(
      screen.getByText('Your password was changed. Log in with your new password.'),
    ).toBeTruthy();
    expect(screen.getByTestId('login-email').props.value).toBe(EMAIL);
  });

  it('a wrong or expired code shows a message and stays on the screen', async () => {
    await openReset();
    routes['POST /auth/reset'] = fail(400, 'INVALID_CODE');
    await type('reset-code', '000000');
    await type('reset-password', 'new-secret-9');
    await press('reset-submit');
    expect(screen.getByText('The code is wrong or has expired. Ask for a new one.')).toBeTruthy();
    expect(screen).toHavePathname('/reset-password');
  });

  it('checks the code and the new password before calling the server', async () => {
    await openReset();
    const before = calls.length;
    await type('reset-code', '12');
    await type('reset-password', 'short');
    await press('reset-submit');
    expect(screen.getByText('Enter the 6-digit code from the email.')).toBeTruthy();
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(calls).toHaveLength(before);
  });

  it('checks the email before sending a code', async () => {
    await renderApp('/forgot-password');
    await type('forgot-email', 'not-an-email');
    await press('forgot-submit');
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('says when the server cannot be reached', async () => {
    routes['POST /auth/forgot'] = 'offline';
    await renderApp('/forgot-password');
    await type('forgot-email', EMAIL);
    await press('forgot-submit');
    expect(
      screen.getByText('Cannot reach the server. Check your internet connection.'),
    ).toBeTruthy();
    expect(screen).toHavePathname('/forgot-password');
  });
});
