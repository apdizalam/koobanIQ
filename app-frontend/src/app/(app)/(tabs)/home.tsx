import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { requestErrorKey } from '../../../auth/errorKey';
import { TabScreen } from '../../../components/layout/TabScreen';
import { Button } from '../../../components/ui/Button';
import { DashboardCard } from '../../../components/ui/DashboardCard';
import { useTheme } from '../../../theme';
import { formatDate } from '../../../utils/format';

type Load = 'loading' | 'ready' | 'network' | 'generic';

/**
 * Home (PRD FR-DASH-01): the account from the API, then one card per area.
 * Areas whose features don't exist yet show an honest empty state with a way
 * forward; nothing here is sample data.
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { user, reloadUser } = useAuth();
  const { colors, typography, spacing, radius } = useTheme();
  const [load, setLoad] = useState<Load>('loading');
  const [refreshing, setRefreshing] = useState(false);
  /** Bumped by "Try again" to load once more. */
  const [attempt, setAttempt] = useState(0);

  const outcome = useCallback(
    (err?: unknown): Load =>
      err === undefined ? 'ready' : requestErrorKey(err) === 'network' ? 'network' : 'generic',
    [],
  );

  // Load the account when Home opens and on every "Try again".
  useEffect(() => {
    let active = true;
    reloadUser().then(
      () => active && setLoad(outcome()),
      (err: unknown) => active && setLoad(outcome(err)),
    );
    return () => {
      active = false;
    };
  }, [attempt, reloadUser, outcome]);

  async function refresh() {
    setRefreshing(true);
    try {
      await reloadUser();
      setLoad('ready');
    } catch (err) {
      setLoad(outcome(err));
    } finally {
      setRefreshing(false);
    }
  }

  function retry() {
    setLoad('loading');
    setAttempt((n) => n + 1);
  }

  return (
    <TabScreen
      testID="home-screen"
      title={t('mobile.home.title')}
      subtitle={user?.email}
      subtitleTestID="home-email"
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      {load === 'loading' ? (
        <View
          testID="home-loading"
          accessibilityRole="progressbar"
          accessibilityLabel={t('common.loading')}
          style={{ paddingVertical: spacing.xxxl, alignItems: 'center' }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {load === 'network' || load === 'generic' ? (
        <View
          testID="home-error"
          accessibilityRole="alert"
          style={{
            backgroundColor: colors.errorSoft,
            borderRadius: radius.card,
            padding: spacing.card,
            gap: spacing.md,
          }}
        >
          <Text style={[typography.body, { color: colors.errorText }]}>
            {t(`mobile.home.error.${load}`)}
          </Text>
          <Button
            variant="secondary"
            label={t('mobile.home.error.retry')}
            onPress={retry}
            testID="home-retry"
          />
        </View>
      ) : null}

      {load === 'ready' && user ? (
        <>
          <DashboardCard testID="home-account" title={t('mobile.home.account.title')}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{user.email}</Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {t('mobile.home.account.memberSince', {
                date: formatDate(user.createdAt, i18n.language),
              })}
            </Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {t('mobile.home.account.language', {
                language: t(`common.language.${user.preferredLanguage}`),
              })}
            </Text>
          </DashboardCard>

          <DashboardCard
            testID="home-profile"
            title={t('mobile.home.profile.title')}
            body={t('mobile.home.profile.empty')}
            action={{
              label: t('mobile.home.profile.action'),
              onPress: () => router.navigate('/profile'),
              testID: 'home-profile-action',
            }}
          />
          <DashboardCard
            testID="home-skills"
            title={t('mobile.home.skills.title')}
            body={t('mobile.home.skills.empty')}
          />
          <DashboardCard
            testID="home-matches"
            title={t('mobile.home.matches.title')}
            body={t('mobile.home.matches.empty')}
            action={{
              label: t('mobile.home.matches.action'),
              onPress: () => router.navigate('/jobs'),
              testID: 'home-matches-action',
            }}
          />
          <DashboardCard
            testID="home-cvs"
            title={t('mobile.home.cvs.title')}
            body={t('mobile.home.cvs.empty')}
            action={{
              label: t('mobile.home.cvs.action'),
              onPress: () => router.navigate('/cv'),
              testID: 'home-cvs-action',
            }}
          />
          <DashboardCard
            testID="home-schedule"
            title={t('mobile.home.schedule.title')}
            body={t('mobile.home.schedule.empty')}
          />
        </>
      ) : null}
    </TabScreen>
  );
}
