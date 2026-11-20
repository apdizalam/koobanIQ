import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { TabScreen } from '../../../components/layout/TabScreen';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { fetchReport } from '../../../services/reportsApi';
import { useTheme } from '../../../theme';
import { REPORT_PERIODS, type Report, type ReportPeriod } from '../../../types/report';

/**
 * Reports tab (TIQ-20): the user's own activity for this hour / day / week /
 * month / year next to the one before. Every number is counted from what is
 * saved (no estimates, nothing from the AI); periods start at local midnight
 * in the phone's time zone. Applications are not counted: users apply on the
 * employer's own site.
 */
export default function ReportsTab() {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { getAccessToken } = useAuth();
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (which: ReportPeriod) => {
      try {
        const data = await fetchReport(await getAccessToken(), which);
        setReport(data.report);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [getAccessToken],
  );

  // Fresh numbers each time the tab shows, and when the period changes.
  useFocusEffect(
    useCallback(() => {
      void load(period);
    }, [load, period]),
  );

  async function refresh() {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  }

  const shown = report?.period === period ? report : null;
  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.card,
    gap: spacing.sm,
  };
  const previousLabel = t(`mobile.reports.previous.${period}`);
  const number = (value: number | null, suffix = '') =>
    value === null ? t('mobile.reports.none') : `${value}${suffix}`;
  const row = (
    testID: string,
    label: string,
    now: number | null,
    before: number | null,
    suffix = '',
  ) => (
    <View
      key={testID}
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${number(now, suffix)}. ${previousLabel}: ${number(before, suffix)}`}
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
    >
      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text testID={`${testID}-now`} style={[typography.bodyStrong, { color: colors.text }]}>
          {number(now, suffix)}
        </Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          {`${previousLabel}: ${number(before, suffix)}`}
        </Text>
      </View>
    </View>
  );
  const section = (testID: string, title: string, rows: ReactNode[]) => (
    <View testID={testID} style={card}>
      <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
        {title}
      </Text>
      {rows}
    </View>
  );

  return (
    <TabScreen
      testID="reports-screen"
      title={t('mobile.tabs.reports')}
      subtitle={t('mobile.reports.subtitle')}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {REPORT_PERIODS.map((p) => (
          <Chip
            key={p}
            testID={`reports-period-${p}`}
            label={t(`mobile.reports.periods.${p}`)}
            selected={period === p}
            onPress={() => setPeriod(p)}
          />
        ))}
      </View>

      {failed && !shown ? <FormMessage text={t('mobile.reports.loadError')} /> : null}
      {!shown && !failed ? <ActivityIndicator color={colors.primary} /> : null}

      {shown ? (
        <View style={{ gap: spacing.lg }}>
          {section('reports-quizzes', t('mobile.reports.sections.quizzes'), [
            row(
              'reports-quizzes-finished',
              t('mobile.reports.quizzesFinished'),
              shown.current.quizzes.finished,
              shown.previous.quizzes.finished,
            ),
            row(
              'reports-quizzes-average',
              t('mobile.reports.quizzesAverage'),
              shown.current.quizzes.averageScorePercent,
              shown.previous.quizzes.averageScorePercent,
              '%',
            ),
          ])}
          {section('reports-interviews', t('mobile.reports.sections.interviews'), [
            row(
              'reports-interviews-finished',
              t('mobile.reports.interviewsFinished'),
              shown.current.interviews.finished,
              shown.previous.interviews.finished,
            ),
            row(
              'reports-interviews-answers',
              t('mobile.reports.interviewsAnswers'),
              shown.current.interviews.answers,
              shown.previous.interviews.answers,
            ),
            row(
              'reports-interviews-average',
              t('mobile.reports.interviewsAverage'),
              shown.current.interviews.averageScore,
              shown.previous.interviews.averageScore,
              '/10',
            ),
          ])}
          {section('reports-cvs', t('mobile.reports.sections.cvs'), [
            row(
              'reports-cvs-created',
              t('mobile.reports.cvsCreated'),
              shown.current.cvs.created,
              shown.previous.cvs.created,
            ),
            row(
              'reports-cvs-approved',
              t('mobile.reports.cvsApproved'),
              shown.current.cvs.approved,
              shown.previous.cvs.approved,
            ),
            row(
              'reports-cvs-exported',
              t('mobile.reports.cvsExported'),
              shown.current.cvs.exported,
              shown.previous.cvs.exported,
            ),
          ])}
          {section('reports-jobs', t('mobile.reports.sections.jobs'), [
            row(
              'reports-jobs-searches',
              t('mobile.reports.jobsSearches'),
              shown.current.jobs.searches,
              shown.previous.jobs.searches,
            ),
            row(
              'reports-jobs-found',
              t('mobile.reports.jobsFound'),
              shown.current.jobs.jobsFound,
              shown.previous.jobs.jobsFound,
            ),
            row(
              'reports-jobs-recommended',
              t('mobile.reports.jobsRecommended'),
              shown.current.jobs.recommended,
              shown.previous.jobs.recommended,
            ),
            row(
              'reports-jobs-saved',
              t('mobile.reports.jobsSaved'),
              shown.current.jobs.saved,
              shown.previous.jobs.saved,
            ),
            row(
              'reports-jobs-ads',
              t('mobile.reports.jobAdsSaved'),
              shown.current.jobs.jobAdsSaved,
              shown.previous.jobs.jobAdsSaved,
            ),
          ])}
          <Text testID="reports-note" style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.reports.note', { timeZone: shown.timeZone })}
          </Text>
        </View>
      ) : null}
    </TabScreen>
  );
}
