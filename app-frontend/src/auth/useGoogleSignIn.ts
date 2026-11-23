import { router } from 'expo-router';
import { useCallback } from 'react';
import { ApiError } from '../services/api';
import { useAuth } from './authContext';
import { openGoogleSignIn, type GoogleBrowserResult } from './googleBrowser';

/** Translation key of the message to show after a Google sign-in that did not finish. */
export type GoogleMessageKey =
  | 'mobile.auth.google.cancelled'
  | 'mobile.auth.google.failed'
  | 'mobile.auth.google.notConfigured'
  | 'mobile.auth.errors.suspended'
  | 'mobile.auth.errors.network'
  | 'mobile.auth.errors.generic';

export type GoogleOutcome = { kind: 'done' } | { kind: 'message'; key: GoogleMessageKey };

/** Message for a failed /auth/google/complete call. */
function messageFor(err: unknown): GoogleMessageKey {
  if (!(err instanceof ApiError)) return 'mobile.auth.errors.generic';
  if (err.code === 'GOOGLE_SIGN_IN_FAILED') return 'mobile.auth.google.failed';
  if (err.code === 'ACCOUNT_SUSPENDED') return 'mobile.auth.errors.suspended';
  if (err.code === 'NETWORK_ERROR') return 'mobile.auth.errors.network';
  return 'mobile.auth.errors.generic';
}

/**
 * "Continue with Google" (TIQ-39) for any screen: opens Google, then signs in.
 * A Google account new to KOBANIQ first goes to "One more step" (age check).
 */
export function useGoogleSignIn() {
  const { signInWithGoogle } = useAuth();

  /** Second half: the app has the one-time code from the return link. */
  const finish = useCallback(
    async (result: GoogleBrowserResult): Promise<GoogleOutcome> => {
      if (result.kind === 'cancelled')
        return { kind: 'message', key: 'mobile.auth.google.cancelled' };
      if (result.kind === 'notConfigured') {
        return { kind: 'message', key: 'mobile.auth.google.notConfigured' };
      }
      if (result.kind === 'failed') return { kind: 'message', key: 'mobile.auth.google.failed' };
      try {
        await signInWithGoogle(result.code);
        router.replace('/home');
        return { kind: 'done' };
      } catch (err) {
        if (err instanceof ApiError && err.code === 'AGE_CONFIRM_REQUIRED') {
          router.replace({ pathname: '/google-age', params: { code: result.code } });
          return { kind: 'done' };
        }
        return { kind: 'message', key: messageFor(err) };
      }
    },
    [signInWithGoogle],
  );

  /** The whole flow, from the button press. */
  const run = useCallback(async (): Promise<GoogleOutcome> => {
    let result: GoogleBrowserResult;
    try {
      result = await openGoogleSignIn();
    } catch {
      return { kind: 'message', key: 'mobile.auth.google.failed' };
    }
    return finish(result);
  }, [finish]);

  return { run, finish, messageFor };
}
