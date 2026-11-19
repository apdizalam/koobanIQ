import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { TabScreen } from '../../../components/layout/TabScreen';
import { Button } from '../../../components/ui/Button';
import { DashboardCard } from '../../../components/ui/DashboardCard';
import { FormMessage } from '../../../components/ui/FormMessage';
import { ListRow } from '../../../components/ui/ListRow';
import { useCvs } from '../../../cv/CvProvider';
import { jobName } from '../../../services/cvApi';
import { useTheme } from '../../../theme';
import { formatDate } from '../../../utils/format';

/**
 * CV tab (TIQ-8/9): start a new CV from a job ad, open saved CVs (newest first,
 * one per job ad, language and version) and the saved job ads.
 */
export default function CvTab() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { status, cvs, jobs, jobById, reload } = useCvs();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const heading = (key: 'cvsTitle' | 'jobsTitle') => (
    <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
      {t(`mobile.cv.tab.${key}`)}
    </Text>
  );

  return (
    <TabScreen
      testID="cv-screen"
      title={t('mobile.tabs.cv')}
      subtitle={t('mobile.cv.tab.subtitle')}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      <Button
        label={t('mobile.cv.tab.newCv')}
        onPress={() => router.push('/cv-job')}
        testID="cv-new"
      />

      {status === 'loading' ? (
        <View testID="cv-loading" style={{ paddingVertical: spacing.xxxl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {status === 'error' ? (
        <View testID="cv-error" style={{ gap: spacing.md }}>
          <FormMessage text={t('mobile.cv.tab.loadError')} />
          <Button
            variant="secondary"
            label={t('mobile.home.error.retry')}
            onPress={() => void reload()}
            testID="cv-retry"
          />
        </View>
      ) : null}

      {status === 'ready' ? (
        <>
          <View style={{ gap: spacing.sm }}>
            {heading('cvsTitle')}
            {cvs.length === 0 ? (
              <DashboardCard
                testID="cv-empty"
                title={t('mobile.cv.tab.emptyTitle')}
                body={t('mobile.cv.tab.emptyBody')}
              />
            ) : (
              cvs.map((cv) => (
                <ListRow
                  key={cv.id}
                  testID={`cv-row-${cv.id}`}
                  title={jobName(jobById(cv.jobDescriptionId), t('mobile.cv.job.untitled'))}
                  detail={[
                    t(`common.language.${cv.language}`),
                    t('mobile.cv.version', { version: cv.version }),
                    t(`mobile.cv.status.${cv.status}`),
                    formatDate(cv.createdAt, i18n.language),
                  ].join(' · ')}
                  onPress={() => router.push({ pathname: '/cv-view/[id]', params: { id: cv.id } })}
                />
              ))
            )}
          </View>

          {jobs.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {heading('jobsTitle')}
              {jobs.map((job) => (
                <ListRow
                  key={job.id}
                  testID={`cv-job-row-${job.id}`}
                  title={jobName(job, t('mobile.cv.job.untitled'))}
                  detail={[job.extracted.company, formatDate(job.createdAt, i18n.language)]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push({ pathname: '/cv-job/[id]', params: { id: job.id } })}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </TabScreen>
  );
}
