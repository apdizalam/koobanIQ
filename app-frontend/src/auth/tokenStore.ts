import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'kobaniq.refreshToken';

/**
 * The refresh token lives in the phone's secure storage (Keychain on iOS,
 * Keystore on Android). The short-lived access token stays in memory only.
 */
export const tokenStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_KEY),
};
