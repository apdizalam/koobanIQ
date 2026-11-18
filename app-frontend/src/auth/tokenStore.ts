import * as SecureStore from 'expo-secure-store';
import { isLanguage } from '../i18n/language';
import type { PublicUser } from '../types/auth';

const REFRESH_KEY = 'kobaniq.refreshToken';
const USER_KEY = 'kobaniq.user';

/**
 * The refresh token lives in the phone's secure storage (Keychain on iOS,
 * Keystore on Android). The short-lived access token stays in memory only.
 */
export const tokenStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_KEY),
};

function isPublicUser(v: unknown): v is PublicUser {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    typeof v.id === 'string' &&
    'email' in v &&
    typeof v.email === 'string' &&
    'role' in v &&
    (v.role === 'user' || v.role === 'admin') &&
    'status' in v &&
    (v.status === 'active' || v.status === 'suspended') &&
    'emailVerified' in v &&
    typeof v.emailVerified === 'boolean' &&
    'preferredLanguage' in v &&
    isLanguage(v.preferredLanguage) &&
    'createdAt' in v &&
    typeof v.createdAt === 'string'
  );
}

/**
 * The last signed-in user (the same public fields the API returns), kept so the
 * app can open signed in when the phone is offline at launch.
 */
export const userStore = {
  async get(): Promise<PublicUser | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPublicUser(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  set: (user: PublicUser) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  clear: () => SecureStore.deleteItemAsync(USER_KEY),
};
