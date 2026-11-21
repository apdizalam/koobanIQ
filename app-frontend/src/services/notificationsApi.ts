import type { AppNotification, NotificationSettings } from '../types/notification';
import { apiRequest } from './api';

export const fetchNotifications = (accessToken: string) =>
  apiRequest<{ notifications: AppNotification[]; unread: number }>('/notifications', {
    accessToken,
  });

export const markNotificationRead = (accessToken: string, id: string) =>
  apiRequest<{ notification: AppNotification }>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    accessToken,
  });

export const markAllNotificationsRead = (accessToken: string) =>
  apiRequest<void>('/notifications/read-all', { method: 'POST', accessToken });

export const fetchNotificationSettings = (accessToken: string) =>
  apiRequest<{ settings: NotificationSettings }>('/notifications/settings', { accessToken });

export const saveNotificationSettings = (
  accessToken: string,
  changes: Partial<Pick<NotificationSettings, 'push' | 'email'>>,
) =>
  apiRequest<{ settings: NotificationSettings }>('/notifications/settings', {
    method: 'PUT',
    accessToken,
    body: changes,
  });

/** This phone receives the user's push notifications. */
export const registerPushToken = (accessToken: string, token: string, platform: string) =>
  apiRequest<void>('/notifications/push-token', {
    method: 'POST',
    accessToken,
    body: { token, platform },
  });

/** On sign-out: this phone stops receiving them. */
export const removePushToken = (accessToken: string, token: string) =>
  apiRequest<void>('/notifications/push-token', {
    method: 'DELETE',
    accessToken,
    body: { token },
  });
