import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAuth } from '../../auth/authContext';
import { AuthScreen } from '../../components/layout/AuthScreen';
import { goBackOrHome } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { DashboardCard } from '../../components/ui/DashboardCard';
import { FormMessage } from '../../components/ui/FormMessage';
import { aiErrorText } from '../../cv/aiErrorText';
import { expoProjectId, getPushToken, rememberPushToken } from '../../notifications/push';
import {
  fetchNotifications,
  fetchNotificationSettings,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushToken,
  saveNotificationSettings,
} from '../../services/notificationsApi';
import { useTheme } from '../../theme';
import type { AppNotification, NotificationSettings } from '../../types/notification';
import { formatDateTime } from '../../utils/format';

/**
 * Notifications, newest first: new strong job matches (TIQ-22, tap opens the
 * job) and announcements from KOBANIQ (TIQ-33, shown in the app's language);
 * and the choices: push to this phone, email. In-app items always come.
 */
export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { getAccessToken } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAccessToken()
        .then((token) => Promise.all([fetchNotifications(token), fetchNotificationSettings(token)]))
        .then(
          ([list, s]) => {
            if (!active) return;
            setItems(list.notifications);
            setSettings(s.settings);
          },
          (err) => {
            if (!active) return;
            setItems([]);
            setProblem(aiErrorText(err, t));
          },
        );
      return () => {
        active = false;
      };
    }, [getAccessToken, t]),
  );

  async function change(key: 'push' | 'email', value: boolean) {
    setProblem(null);
    try {
      const token = await getAccessToken();
      const { settings: next } = await saveNotificationSettings(token, { [key]: value });
      setSettings(next);
      // Turning push on: ask this phone for permission and register it now.
      if (key === 'push' && value) {
        const pushToken = await getPushToken();
        if (pushToken) {
          await registerPushToken(token, pushToken, Platform.OS);
          rememberPushToken(pushToken);
        }
      }
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  async function open(n: AppNotification) {
    if (!n.read) {
      setItems((list) => (list ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void getAccessToken()
        .then((token) => markNotificationRead(token, n.id))
        .catch(() => undefined);
    }
    // An announcement is read here; a strong match opens its job.
    if (n.type === 'strong_match') router.push({ pathname: '/job/[id]', params: { id: n.jobId } });
  }

  async function readAll() {
    try {
      await markAllNotificationsRead(await getAccessToken());
      setItems((list) => (list ?? []).map((x) => ({ ...x, read: true })));
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  const unread = (items ?? []).filter((n) => !n.read).length;

  return (
    <AuthScreen
      showBack
      onBack={goBackOrHome}
      title={t('mobile.notifications.title')}
      subtitle={t('mobile.notifications.subtitle')}
    >
      {problem ? <FormMessage text={problem} /> : null}

      {settings ? (
        <DashboardCard title={t('mobile.notifications.settings')}>
          <View style={{ gap: spacing.sm }}>
            <Checkbox
              testID="notify-push"
              label={t('mobile.notifications.push')}
              checked={settings.push}
              onChange={(v) => void change('push', v)}
            />
            {!expoProjectId() ? (
              <Text
                testID="notify-push-unavailable"
                style={[typography.bodySmall, { color: colors.textMuted }]}
              >
                {t('mobile.notifications.pushUnavailable')}
              </Text>
            ) : null}
            <Checkbox
              testID="notify-email"
              label={t('mobile.notifications.email')}
              checked={settings.email}
              onChange={(v) => void change('email', v)}
            />
            {!settings.emailAvailable ? (
              <Text
                testID="notify-email-unavailable"
                style={[typography.bodySmall, { color: colors.textMuted }]}
              >
                {t('mobile.notifications.emailUnavailable')}
              </Text>
            ) : null}
          </View>
        </DashboardCard>
      ) : null}

      {items && items.length === 0 ? (
        <DashboardCard
          title={t('mobile.notifications.emptyTitle')}
          body={t('mobile.notifications.emptyBody')}
        />
      ) : null}
      {unread > 0 ? (
        <Button
          variant="ghost"
          testID="notify-read-all"
          label={t('mobile.notifications.readAll')}
          onPress={() => void readAll()}
        />
      ) : null}
      {(items ?? []).map((n) => {
        const lang = i18n.language === 'so' ? 'so' : 'en';
        const label =
          n.type === 'announcement'
            ? t('mobile.notifications.announcement')
            : t('mobile.notifications.strongMatch', { score: n.values.score });
        const heading = n.type === 'announcement' ? n.message.title[lang] : n.values.title;
        const detail =
          n.type === 'announcement'
            ? n.message.body[lang]
            : `${n.values.employer} · ${formatDateTime(n.createdAt, i18n.language)}`;
        return (
          <Pressable
            key={n.id}
            testID={`notification-${n.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              n.type === 'announcement'
                ? `${label}: ${heading}. ${detail}`
                : `${label}: ${n.values.title}, ${n.values.employer}`
            }
            onPress={() => void open(n)}
            style={({ pressed }) => ({
              backgroundColor: n.read ? colors.surface : colors.primarySoft,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.card,
              padding: spacing.card,
              gap: spacing.xxs,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={[typography.labelMedium, { color: colors.primary }]}>{label}</Text>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{heading}</Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>{detail}</Text>
            {n.type === 'announcement' ? (
              <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                {formatDateTime(n.createdAt, i18n.language)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </AuthScreen>
  );
}
