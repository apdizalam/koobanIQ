import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Push notifications (TIQ-22) with expo-notifications and the free Expo Push
 * Service. A push token needs the app's Expo project id (set by `eas init`);
 * without it, or when the user says no, the app simply has no push (the
 * in-app list still works). Never throws into the app.
 */

/** The Expo project id, or null when the app is not linked to an Expo project yet. */
export function expoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Shown while the app is open, too. */
export function showPushWhileOpen() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Not available here (e.g. web): the in-app list still works.
  }
}

/**
 * Asks for permission (only if not decided yet) and returns this phone's Expo
 * push token, or null (no project id, permission refused, simulator, offline).
 */
export async function getPushToken(): Promise<string | null> {
  const projectId = expoProjectId();
  if (!projectId) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'KOBANIQ',
        // eslint-disable-next-line import/namespace -- re-exported enum the lint resolver cannot follow; TypeScript checks it
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted
      ? 'granted'
      : (await Notifications.requestPermissionsAsync()).granted
        ? 'granted'
        : 'denied';
    if (status !== 'granted') return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.warn('[push] no token:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** A tapped push about an announcement (TIQ-33): the app opens the notifications list. */
export function isAnnouncementPush(response: Notifications.NotificationResponse | null): boolean {
  const data = response?.notification?.request?.content?.data as { type?: unknown } | undefined;
  return data?.type === 'announcement';
}

/** A job id we can safely put in a screen address (letters, digits, - and _). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The job a tapped notification is about (data.jobId), if any and well-formed. */
export function jobIdOf(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification?.request?.content?.data as { jobId?: unknown } | undefined;
  return typeof data?.jobId === 'string' && SAFE_ID.test(data.jobId) ? data.jobId : null;
}

/**
 * The tapped notification's own id, so one tap is handled once even if it
 * arrives both as "the tap that opened the app" and through the listener.
 */
export function responseKey(response: Notifications.NotificationResponse | null): string | null {
  const id = (response?.notification?.request as { identifier?: unknown } | undefined)?.identifier;
  return typeof id === 'string' && id ? id : null;
}

/** The token this phone registered for the signed-in user (removed again on sign-out). */
let registered: string | null = null;
export const registeredPushToken = () => registered;
export const rememberPushToken = (token: string | null) => {
  registered = token;
};
