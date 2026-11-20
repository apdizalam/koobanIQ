import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { JobResults } from '../../../components/jobs/JobResults';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { goBackOrHome } from '../../../components/ui/BackButton';
import { FormMessage } from '../../../components/ui/FormMessage';
import { aiErrorText } from '../../../cv/aiErrorText';
import { pollSettings } from '../../../jobs/pollSettings';
import { useSavedJobs } from '../../../jobs/useSavedJobs';
import { fetchJobSources, fetchRun } from '../../../services/jobsApi';
import { useTheme } from '../../../theme';
import type { RunResults } from '../../../types/jobs';

/**
 * One new search (method B, TIQ-16/18): progress per source while it runs
 * (checked every few seconds), what each source gave or why it failed, then
 * the jobs that fit, with the lower matches only on request.
 */
export default function ResearchRunScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { getAccessToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { savedIds, toggleSave, saveFailed } = useSavedJobs();
  const [data, setData] = useState<RunResults | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  // Checks the search until it has finished; stops when the screen closes.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const next = await fetchRun(await getAccessToken(), id);
        if (!active) return;
        setData(next);
        setProblem(null);
        if (next.run.status === 'running') timer = setTimeout(check, pollSettings.intervalMs);
      } catch (err) {
        if (!active) return;
        setProblem(aiErrorText(err, t));
        timer = setTimeout(check, pollSettings.intervalMs * 2);
      }
    };
    void check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [getAccessToken, id, t]);

  // Source names for the progress list (the run only has their keys).
  const regionKey = data?.run.regions.join(',');
  useEffect(() => {
    if (!regionKey) return;
    let active = true;
    getAccessToken()
      .then((token) => fetchJobSources(token, regionKey.split(',') as never))
      .then(
        ({ sources, unavailable }) => {
          if (!active) return;
          setNames(Object.fromEntries([...sources, ...unavailable].map((s) => [s.key, s.name])));
        },
        () => undefined,
      );
    return () => {
      active = false;
    };
  }, [getAccessToken, regionKey]);

  const run = data?.run;
  const running = !run || run.status === 'running';

  return (
    <AuthScreen
      showBack
      onBack={goBackOrHome}
      title={t(running ? 'mobile.jobs.run.runningTitle' : 'mobile.jobs.run.doneTitle')}
      subtitle={t(`mobile.jobs.run.status.${run?.status ?? 'running'}`)}
    >
      {problem ? <FormMessage text={problem} /> : null}
      {saveFailed ? <FormMessage text={t('mobile.jobs.saveFailed')} /> : null}
      {running ? (
        <View testID="run-running" style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.jobs.run.wait')}
          </Text>
        </View>
      ) : null}

      {run ? (
        <View testID="run-sources" style={{ gap: spacing.sm }}>
          {run.sourceKeys.map((key) => {
            const p = run.perSource.find((s) => s.key === key);
            const text = !p
              ? t('mobile.jobs.run.sourceWaiting')
              : p.error
                ? t('mobile.jobs.run.sourceFailed', { error: p.error })
                : t('mobile.jobs.run.sourceDone', { found: p.found, new: p.new });
            return (
              <View key={key} testID={`run-source-${key}`} accessible style={{ gap: spacing.xxs }}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>
                  {names[key] ?? key}
                </Text>
                <Text
                  style={[
                    typography.bodySmall,
                    { color: p?.error ? colors.errorText : colors.textMuted },
                  ]}
                >
                  {text}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {run && !running ? (
        <View style={{ gap: spacing.md }}>
          <Text testID="run-summary" style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.jobs.run.summary', { found: run.jobsFound, new: run.jobsNew })}
          </Text>
          {run.status === 'failed' ? (
            <FormMessage text={t('mobile.jobs.run.failed')} />
          ) : (
            <JobResults
              recommended={data!.recommended}
              lowerMatch={data!.lowerMatch}
              lowerCount={data!.lowerMatch.length}
              savedIds={savedIds}
              onToggleSave={(jobId) => void toggleSave(jobId)}
            />
          )}
        </View>
      ) : null}
    </AuthScreen>
  );
}
