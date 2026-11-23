import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import {
  exchangeGoogleCode,
  googleAuthUrl,
  googleConfigured,
  randomToken,
  sha256,
} from '../lib/googleOAuth.js';
import { GoogleSignIn } from '../models/GoogleSignIn.js';
import { User, type Language } from '../models/User.js';
import { startSession } from './authService.js';

/**
 * "Continue with Google" (TIQ-39).
 *
 * 1. The app opens GET /auth/google/start?returnUrl=<app link> in a browser.
 * 2. The server sends the browser to Google; Google sends it back to /callback.
 * 3. The server checks Google's answer and sends the browser to the app link
 *    with a one-time code (never a token).
 * 4. The app posts the code to /auth/google/complete and gets a normal session.
 *
 * A Google account with the same email as an existing account signs in to that
 * account. New accounts made with Google have no password.
 */

const ATTEMPT_MINUTES = 10;
const HANDOFF_MINUTES = 5;

/** Errors the app understands in the return link: `?error=<one of these>`. */
export type GoogleReturnError = 'cancelled' | 'failed' | 'not_configured';

/**
 * Only links that open our app are allowed back, so this server can't be used
 * to send people to other websites. `exp://` is Expo Go during development.
 */
export function isAllowedReturnUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'kobaniq:') return true;
  return env.nodeEnv !== 'production' && (url.protocol === 'exp:' || url.protocol === 'exps:');
}

export function withParams(returnUrl: string, params: Record<string, string>) {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Step 1: remembers the attempt and returns Google's sign-in page address. */
export async function startGoogleSignIn(returnUrl: string) {
  if (!googleConfigured()) return withParams(returnUrl, { error: 'not_configured' });
  const state = randomToken();
  const codeVerifier = randomToken();
  await GoogleSignIn.create({
    state,
    codeVerifier,
    returnUrl,
    expiresAt: new Date(Date.now() + ATTEMPT_MINUTES * 60_000),
  });
  return googleAuthUrl(state, codeVerifier);
}

/**
 * Step 3: Google sent the browser back. Returns the app link to open, or null
 * when the attempt is unknown or too old (the caller shows a short page).
 */
export async function finishGoogleCallback(query: Record<string, unknown>) {
  const state = typeof query.state === 'string' ? query.state : '';
  const attempt = state
    ? await GoogleSignIn.findOne({ state, handoffHash: null, expiresAt: { $gt: new Date() } })
    : null;
  if (!attempt) return null;

  const fail = async (error: GoogleReturnError) => {
    await attempt.deleteOne();
    return withParams(attempt.returnUrl, { error });
  };
  if (typeof query.error === 'string') {
    return fail(query.error === 'access_denied' ? 'cancelled' : 'failed');
  }
  if (typeof query.code !== 'string' || !query.code) return fail('failed');

  let identity;
  try {
    identity = await exchangeGoogleCode(query.code, attempt.codeVerifier);
  } catch (err) {
    console.error('Google sign-in failed:', err instanceof Error ? err.message : err);
    return fail('failed');
  }
  // Only an address Google has confirmed may sign in to (or create) an account.
  if (!identity.emailVerified) return fail('failed');

  const handoff = randomToken();
  attempt.handoffHash = sha256(handoff);
  attempt.google = identity;
  attempt.expiresAt = new Date(Date.now() + HANDOFF_MINUTES * 60_000);
  await attempt.save();
  return withParams(attempt.returnUrl, { code: handoff });
}

export interface CompleteGoogleInput {
  code: string;
  /** "I am 18 or older": needed only when the Google account is new to KOBANIQ. */
  ageConfirmed?: boolean;
  preferredLanguage?: Language;
  device?: string;
}

/** Step 4: swaps the one-time code for a session (signs in, links or creates the account). */
export async function completeGoogleSignIn(input: CompleteGoogleInput) {
  const attempt = await GoogleSignIn.findOne({
    handoffHash: sha256(input.code),
    expiresAt: { $gt: new Date() },
  });
  const google = attempt?.google;
  if (!attempt || !google?.sub || !google.email) {
    throw new AppError(400, 'GOOGLE_SIGN_IN_FAILED', 'Google sign-in failed. Please try again');
  }

  let user = await User.findOne({ googleId: google.sub });
  if (!user) {
    user = await User.findOne({ email: google.email });
    if (user?.googleId) {
      // This email already belongs to a different Google account.
      await attempt.deleteOne();
      throw new AppError(400, 'GOOGLE_SIGN_IN_FAILED', 'Google sign-in failed. Please try again');
    }
    if (user) {
      // Same email as an existing account: the same account, now also with Google.
      user.googleId = google.sub;
      user.emailVerified = true;
    }
  }
  if (!user) {
    if (input.ageConfirmed !== true) {
      // The attempt is kept so the app can ask and send the same code again.
      throw new AppError(400, 'AGE_CONFIRM_REQUIRED', 'Please confirm you are 18 or older');
    }
    user = new User({
      email: google.email,
      authProvider: 'google',
      googleId: google.sub,
      emailVerified: true,
      preferredLanguage: input.preferredLanguage ?? 'en',
      ageConfirmedAt: new Date(),
    });
  }

  await attempt.deleteOne();
  if (user.status === 'suspended') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  }
  // startSession saves the user (new account, or the Google link).
  return startSession(user, input.device);
}
