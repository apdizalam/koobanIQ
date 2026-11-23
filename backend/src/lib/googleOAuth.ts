import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Google OpenID Connect, done by the server (TIQ-39). The app only opens a
 * browser page; the client secret and Google's tokens never reach the phone.
 * This works the same in Expo Go, in store builds and on the web.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export const googleConfigured = () =>
  !!(env.googleClientId && env.googleClientSecret && env.googleRedirectUri);

export const randomToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

/** Google's sign-in page for one attempt (code flow with PKCE, account chooser). */
export function googleAuthUrl(state: string, codeVerifier: string) {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: sha256(codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Swaps Google's one-time code for the person's identity. The ID token comes
 * straight from Google's token endpoint over HTTPS, so (OpenID Connect Core
 * 3.1.3.7) its issuer, audience and expiry are checked, not its signature.
 * Throws on any problem; the caller shows one general "Google sign-in failed".
 */
export async function exchangeGoogleCode(code: string, codeVerifier: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token endpoint answered ${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error('Google sent no ID token');
  return readIdToken(body.id_token);
}

/** Checks the ID token's claims and returns who signed in. */
export function readIdToken(idToken: string): GoogleIdentity {
  const claims = jwt.decode(idToken);
  if (!claims || typeof claims !== 'object') throw new Error('Unreadable ID token');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss))) throw new Error('Wrong ID token issuer');
  if (!audience.includes(env.googleClientId)) throw new Error('ID token is for another app');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    throw new Error('ID token expired');
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('ID token has no subject');
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email) throw new Error('Google sent no email address');
  const verified = (claims as { email_verified?: unknown }).email_verified;
  return { sub: claims.sub, email, emailVerified: verified === true || verified === 'true' };
}
