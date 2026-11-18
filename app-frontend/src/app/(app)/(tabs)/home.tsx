import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../auth/authContext';
import { requestErrorKey } from '../../../auth/errorKey';
import { Button } from '../../../components/ui/Button';
import { DashboardCard } from '../../../components/ui/DashboardCard';
import { LineIcon } from '../../../components/ui/LineIcon';
import { QuickAction } from '../../../components/ui/QuickAction';
import { TextLink } from '../../../components/ui/TextLink';
import { useTheme } from '../../../theme';
import { displayName, greetingFor, initials } from '../../../utils/greeting';

type Load = 'loading' | 'ready' | 'network' | 'generic';

/**
 * Home (PRD FR-DASH-01; design "04 · Home — Overview"): greeting, skill profile,
 * quick actions, top match, recent CVs, next scheduled search. The account
 * comes from the API (GET /me). Areas whose features are not built yet show an
 * honest empty state; nothing here is sample data.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
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

  const name = user ? displayName(user.email) : '';
  const onNavy = { color: colors.onPrimary };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar style="auto" />
      <ScrollView
        testID="home-screen"
        contentContainerStyle={{
          paddingHorizontal: spacing.screen,
          paddingVertical: spacing.lg,
          gap: spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Greeting */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            accessible={false}
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[typography.bodyStrong, onNavy]}>{initials(name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              {t(`mobile.home.greeting.${greetingFor(new Date().getHours())}`)}
            </Text>
            <Text
              testID="home-name"
              accessibilityRole="header"
              numberOfLines={1}
              style={[typography.h1, { color: colors.text }]}
            >
              {name}
            </Text>
          </View>
        </View>

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

        {load === 'ready' ? (
          <>
            {/* Skill profile (skills come with TIQ-12; until then 0 assessed) */}
            <View
              testID="home-skills"
              style={{
                backgroundColor: colors.primary,
                borderRadius: radius.card,
                padding: spacing.xl,
                gap: spacing.md,
              }}
            >
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}
              >
                <Text accessibilityRole="header" style={[typography.h2, onNavy]}>
                  {t('mobile.home.skillCard.title')}
                </Text>
                <Text style={[typography.labelMedium, onNavy]}>
                  {t('mobile.home.skillCard.count', { count: 0 })}
                </Text>
              </View>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: 0 }}
                style={{ height: 6, borderRadius: radius.pill, overflow: 'hidden' }}
              >
                <View style={{ flex: 1, backgroundColor: colors.onPrimary, opacity: 0.25 }} />
              </View>
              <Text style={[typography.body, onNavy, { opacity: 0.9 }]}>
                {t('mobile.home.skillCard.empty')}
              </Text>
              <TextLink
                label={`${t('mobile.home.skillCard.action')} ›`}
                color={colors.onPrimary}
                align="flex-start"
                onPress={() => router.navigate('/profile')}
                testID="home-skills-action"
              />
            </View>

            {/* Quick actions */}
            <View style={{ gap: spacing.md }}>
              <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
                {t('mobile.home.quick.title')}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <QuickAction
                  icon="cv"
                  label={t('mobile.home.quick.tailorCv')}
                  onPress={() => router.navigate('/cv')}
                  testID="home-quick-cv"
                />
                <QuickAction
                  icon="search"
                  label={t('mobile.home.quick.researchJobs')}
                  onPress={() => router.navigate('/jobs')}
                  testID="home-quick-jobs"
                />
                <QuickAction
                  icon="target"
                  label={t('mobile.home.quick.assessSkill')}
                  soonLabel={t('mobile.home.quick.soon')}
                  onPress={() => undefined}
                  testID="home-quick-assess"
                />
                <QuickAction
                  icon="mic"
                  label={t('mobile.home.quick.practiceInterview')}
                  soonLabel={t('mobile.home.quick.soon')}
                  onPress={() => undefined}
                  testID="home-quick-interview"
                />
              </View>
            </View>

            {/* Top match today (matching comes with TIQ-17) */}
            <View style={{ gap: spacing.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
                  {t('mobile.home.topMatch.title')}
                </Text>
                <TextLink
                  label={t('mobile.home.topMatch.seeAll')}
                  onPress={() => router.navigate('/jobs')}
                  testID="home-matches-action"
                />
              </View>
              <View
                testID="home-matches"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: radius.card,
                  padding: spacing.card,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.button,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LineIcon name="jobs" color={colors.primary} size={22} />
                </View>
                <Text style={[typography.body, { color: colors.textMuted, flex: 1 }]}>
                  {t('mobile.home.topMatch.empty')}
                </Text>
              </View>
            </View>

            <DashboardCard
              testID="home-cvs"
              title={t('mobile.home.cvs.title')}
              body={t('mobile.home.cvs.empty')}
            />
            <DashboardCard
              testID="home-schedule"
              title={t('mobile.home.schedule.title')}
              body={t('mobile.home.schedule.empty')}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
