import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE_URL } from '../constants/api';

/**
 * The browser part of "Continue with Google" (TIQ-39). The app opens the
 * server's /auth/google/start page; the server talks to Google and sends the
 * browser back to the app link with a one-time code. Works in Expo Go (exp://)
 * and in store builds (kobaniq://).
 */
export type GoogleBrowserResult =
  | { kind: 'code'; code: string }
  | { kind: 'cancelled' }
  | { kind: 'failed' }
  | { kind: 'notConfigured' };

/** The app link Google's answer comes back to (also a screen: src/app/auth/google.tsx). */
export const googleReturnUrl = () => Linking.createURL('auth/google');

/** Reads `?code=` or `?error=` from the return link. */
export function readGoogleReturn(params: {
  code?: string | string[];
  error?: string | string[];
}): GoogleBrowserResult {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  if (code) return { kind: 'code', code };
  if (error === 'cancelled') return { kind: 'cancelled' };
  if (error === 'not_configured') return { kind: 'notConfigured' };
  return { kind: 'failed' };
}

export async function openGoogleSignIn(): Promise<GoogleBrowserResult> {
  const returnUrl = googleReturnUrl();
  const start = `${API_BASE_URL}/auth/google/start?returnUrl=${encodeURIComponent(returnUrl)}`;
  const result = await WebBrowser.openAuthSessionAsync(start, returnUrl);
  if (result.type !== 'success') return { kind: 'cancelled' };
  return readGoogleReturn(queryOf(result.url));
}

/** `?code=…&error=…` of a link (any scheme: exp://, kobaniq://). */
export function queryOf(link: string): Record<string, string> {
  const query = link.split('#')[0].split('?')[1] ?? '';
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const [key, value = ''] = part.split('=');
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      // A broken escape: ignore that part.
    }
  }
  return out;
}
