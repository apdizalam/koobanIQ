import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { goBackOrHome } from '../../../components/ui/BackButton';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { MatchBadge } from '../../../components/ui/MatchBadge';
import { aiErrorText } from '../../../cv/aiErrorText';
import { badgeOf, hostOf, isWebLink, placeOf, reasonTexts } from '../../../jobs/matchText';
import { fetchJob, saveJob, unsaveJob } from '../../../services/jobsApi';
import { useTheme } from '../../../theme';
import type { MatchedJob } from '../../../types/jobs';
import { formatDate } from '../../../utils/format';

/** Longest description shown before "Show all". */
const SHORT_DESCRIPTION = 600;

/**
 * One job (TIQ-18): the match and why, missing essential skills, career level
 * (marked estimated / unknown when the profile doesn't show enough), dates as
 * the source gives them (never called "new"), where it comes from, and the
 * apply link on the source's own site. Save / unsave.
 */
export default function JobDetailScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { getAccessToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<(MatchedJob & { saved: boolean }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fullText, setFullText] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getAccessToken()
      .then((token) => fetchJob(token, id))
      .then(
        (data) => active && setItem(data),
        (err) => active && setProblem(aiErrorText(err, t)),
      );
    return () => {
      active = false;
    };
  }, [getAccessToken, id, t]);

  async function toggleSave() {
    if (!item || saving) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      await (item.saved ? unsaveJob(token, item.job.id) : saveJob(token, item.job.id));
      setItem({ ...item, saved: !item.saved });
    } catch {
      setProblem(t('mobile.jobs.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!item) {
    return (
      <AuthScreen
        showBack
        onBack={goBackOrHome}
        title={t('mobile.jobs.detail.loading')}
        subtitle=""
      >
        {problem ? <FormMessage text={problem} /> : <ActivityIndicator color={colors.primary} />}
      </AuthScreen>
    );
  }

  const { job, match } = item;
  const date = (iso: string) => formatDate(iso, i18n.language);
  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
      {text}
    </Text>
  );
  const line = (text: string, testID?: string) => (
    <Text testID={testID} style={[typography.body, { color: colors.text }]}>
      {text}
    </Text>
  );
  const muted = (text: string, testID?: string) => (
    <Text testID={testID} style={[typography.bodySmall, { color: colors.textMuted }]}>
      {text}
    </Text>
  );
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm };
  const description = job.description ?? '';
  const level = (key: string | null) =>
    t(`mobile.jobs.level.${key ?? 'unknown'}` as 'mobile.jobs.level.entry');
  const sourceName = t(`mobile.jobs.sourceNames.${job.sourceKey}`, { defaultValue: job.sourceKey });
  const host = hostOf(job.applyUrl);

  return (
    <AuthScreen
      showBack
      onBack={goBackOrHome}
      title={job.title}
      subtitle={`${job.employer} · ${placeOf(job, t)}`}
    >
      {problem ? <FormMessage text={problem} /> : null}

      <View testID="job-match" style={{ gap: spacing.sm }}>
        <MatchBadge {...badgeOf(match, t)} />
        {muted(t('mobile.jobs.results.scoreNote'))}
        {!match.recommended ? (
          <FormMessage tone="info" text={t('mobile.jobs.detail.notRecommended')} />
        ) : null}
      </View>

      <View testID="job-why" style={{ gap: spacing.xs }}>
        {heading(t('mobile.jobs.detail.why'))}
        {reasonTexts(match, t).map((text, i) => (
          <Text key={i} style={[typography.body, { color: colors.text }]}>
            {`• ${text}`}
          </Text>
        ))}
      </View>

      {match.missingRequired.length > 0 || match.missingPreferred.length > 0 ? (
        <View testID="job-missing" style={{ gap: spacing.sm }}>
          {match.missingRequired.length > 0 ? (
            <>
              {heading(t('mobile.jobs.detail.missingRequired'))}
              <View style={row}>
                {match.missingRequired.map((s) => (
                  <Chip key={s} label={s} />
                ))}
              </View>
            </>
          ) : null}
          {match.missingPreferred.length > 0 ? (
            <>
              {heading(t('mobile.jobs.detail.missingPreferred'))}
              <View style={row}>
                {match.missingPreferred.map((s) => (
                  <Chip key={s} label={s} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <View testID="job-level" style={{ gap: spacing.xs }}>
        {heading(t('mobile.jobs.detail.level'))}
        {line(t('mobile.jobs.detail.jobLevel', { level: level(match.jobLevel) }))}
        {line(t('mobile.jobs.detail.yourLevel', { level: level(match.userLevel) }))}
        {match.levelConfidence !== 'confident'
          ? muted(
              t(`mobile.jobs.detail.confidence.${match.levelConfidence}`),
              'job-level-confidence',
            )
          : null}
      </View>

      <View testID="job-facts" style={{ gap: spacing.xs }}>
        {heading(t('mobile.jobs.detail.facts'))}
        {job.jobType
          ? line(t(`mobile.profile.jobTypes.${job.jobType}` as 'mobile.profile.jobTypes.full_time'))
          : null}
        {job.workMode
          ? line(t(`mobile.profile.workModes.${job.workMode}` as 'mobile.profile.workModes.remote'))
          : null}
        {line(
          job.deadline
            ? t('mobile.jobs.detail.deadline', { date: date(job.deadline) })
            : t('mobile.jobs.detail.noDeadline'),
          'job-deadline',
        )}
        {line(
          job.postedAt
            ? t('mobile.jobs.detail.posted', { date: date(job.postedAt) })
            : t('mobile.jobs.detail.notPosted', { date: date(job.firstSeenAt) }),
          'job-posted',
        )}
        {muted(
          host
            ? t('mobile.jobs.detail.sourceWithSite', { source: sourceName, site: host })
            : t('mobile.jobs.detail.source', { source: sourceName }),
          'job-source',
        )}
      </View>

      {description ? (
        <View style={{ gap: spacing.xs }}>
          {heading(t('mobile.jobs.detail.description'))}
          {line(
            fullText || description.length <= SHORT_DESCRIPTION
              ? description
              : `${description.slice(0, SHORT_DESCRIPTION).trimEnd()}…`,
          )}
          {description.length > SHORT_DESCRIPTION && !fullText ? (
            <Button
              variant="ghost"
              testID="job-show-all"
              label={t('mobile.jobs.detail.showAll')}
              onPress={() => setFullText(true)}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {isWebLink(job.applyUrl) ? (
          <Button
            testID="job-apply"
            label={t('mobile.jobs.detail.apply')}
            onPress={() => void Linking.openURL(job.applyUrl)}
          />
        ) : null}
        {muted(t('mobile.jobs.detail.applyNote'))}
        <Button
          variant="secondary"
          testID="job-save"
          loading={saving}
          label={item.saved ? t('mobile.jobs.unsave') : t('mobile.jobs.save')}
          onPress={() => void toggleSave()}
        />
      </View>
    </AuthScreen>
  );
}
