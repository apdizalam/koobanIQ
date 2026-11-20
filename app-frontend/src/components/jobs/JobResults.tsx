import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { badgeOf, placeOf, shortWhy } from '../../jobs/matchText';
import { useTheme } from '../../theme';
import type { MatchedJob } from '../../types/jobs';
import { Button } from '../ui/Button';
import { DashboardCard } from '../ui/DashboardCard';
import { JobCard } from '../ui/JobCard';

interface JobResultsProps {
  recommended: MatchedJob[];
  lowerMatch: MatchedJob[];
  /** How many lower matches exist (they may not be loaded yet). */
  lowerCount: number;
  savedIds: Set<string>;
  onToggleSave: (jobId: string) => void;
  /** Called when the user asks to see the lower matches (load them if needed). */
  onShowLower?: () => void;
  /** Heading above the list (default: the number of jobs that fit). */
  heading?: string;
  testID?: string;
}

/**
 * Results of either search: the jobs that fit first; lower matches only when
 * the user asks, in their own section (never mixed in, never pushed). With
 * nothing that fits, an honest message instead of filler jobs.
 */
export function JobResults({
  recommended,
  lowerMatch,
  lowerCount,
  savedIds,
  onToggleSave,
  onShowLower,
  heading,
  testID = 'job-results',
}: JobResultsProps) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const [showLower, setShowLower] = useState(false);

  const card = (item: MatchedJob, group: string) => (
    <JobCard
      key={item.job.id}
      testID={`job-${group}-${item.job.id}`}
      title={item.job.title}
      company={item.job.employer}
      location={placeOf(item.job, t)}
      match={badgeOf(item.match, t)}
      explanation={shortWhy(item.match, t)}
      saved={savedIds.has(item.job.id)}
      saveLabels={{ save: t('mobile.jobs.save'), saved: t('mobile.jobs.saved') }}
      onToggleSave={() => onToggleSave(item.job.id)}
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.job.id } })}
    />
  );

  return (
    <View testID={testID} style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
        {heading ?? t('mobile.jobs.results.recommended', { count: recommended.length })}
      </Text>
      {recommended.length === 0 ? (
        <DashboardCard
          testID="jobs-none-suitable"
          title={t('mobile.jobs.results.noneTitle')}
          body={t('mobile.jobs.results.noneBody')}
        />
      ) : (
        recommended.map((item) => card(item, 'rec'))
      )}
      <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
        {t('mobile.jobs.results.scoreNote')}
      </Text>

      {lowerCount > 0 && !showLower ? (
        <Button
          variant="secondary"
          testID="jobs-show-lower"
          label={t('mobile.jobs.results.showLower', { count: lowerCount })}
          onPress={() => {
            setShowLower(true);
            onShowLower?.();
          }}
        />
      ) : null}
      {showLower && lowerMatch.length > 0 ? (
        <View testID="jobs-lower-section" style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
            {t('mobile.jobs.results.lowerTitle')}
          </Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.jobs.results.lowerBody')}
          </Text>
          {lowerMatch.map((item) => card(item, 'low'))}
        </View>
      ) : null}
    </View>
  );
}
