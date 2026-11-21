import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../auth/authContext';
import { fetchNotificationSettings, registerPushToken } from '../services/notificationsApi';
import { getPushToken, jobIdOf, rememberPushToken, showPushWhileOpen } from './push';

const openJob = (jobId: string | null) => {
  if (jobId) router.push({ pathname: '/job/[id]', params: { id: jobId } });
};

/**
 * Signed-in part of push (TIQ-22), mounted once in the (app) layout:
 * registers this phone when the user allows push, and opens the job when a
 * push is tapped (also when the tap started the app). Renders nothing.
 */
export function PushSetup() {
  const { getAccessToken } = useAuth();

  useEffect(() => {
    let active = true;
    showPushWhileOpen();
    (async () => {
      try {
        const token = await getAccessToken();
        const { settings } = await fetchNotificationSettings(token);
        if (!settings.push || !active) return;
        const pushToken = await getPushToken();
        if (!pushToken || !active) return;
        await registerPushToken(token, pushToken, Platform.OS);
        rememberPushToken(pushToken);
      } catch {
        // No push this time (offline, no permission): the in-app list still works.
      }
    })();
    return () => {
      active = false;
    };
  }, [getAccessToken]);

  useEffect(() => {
    // A tap that opened the app from closed.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        openJob(jobIdOf(response));
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((response) =>
      openJob(jobIdOf(response)),
    );
    return () => sub.remove();
  }, []);

  return null;
}
