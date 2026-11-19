import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { JobDescription } from '../../types/cv';
import { useTheme } from '../../theme';
import { formatDate } from '../../utils/format';
import { Chip } from '../ui/Chip';

/**
 * What the AI read from a job ad (TIQ-8): title, company, place, deadline,
 * required and preferred skills (kept apart), and the main requirements.
 * Values stay in the ad's own language.
 */
export function JobDetails({ job }: { job: JobDescription }) {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const e = job.extracted;
  const facts = [e.company, e.location, e.jobType].filter(Boolean).join(' · ');

  const section = (key: string, title: string, items: string[], asChips: boolean) =>
    items.length === 0 ? null : (
      <View key={key} testID={`job-${key}`} style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={[typography.labelMedium, { color: colors.text }]}>
          {title}
        </Text>
        {asChips ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {items.map((item) => (
              <Chip key={item} label={item} />
            ))}
          </View>
        ) : (
          items.slice(0, 6).map((item) => (
            <Text key={item} style={[typography.body, { color: colors.textMuted }]}>
              • {item}
            </Text>
          ))
        )}
      </View>
    );

  return (
    <View
      testID="job-details"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.lg,
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          {e.title ?? t('mobile.cv.job.untitled')}
        </Text>
        {facts ? <Text style={[typography.body, { color: colors.textMuted }]}>{facts}</Text> : null}
        {e.deadline ? (
          <Text testID="job-deadline" style={[typography.bodySmall, { color: colors.warningText }]}>
            {t('mobile.cv.job.deadline', { date: formatDate(e.deadline, i18n.language) })}
          </Text>
        ) : null}
      </View>
      {section('required', t('mobile.cv.job.required'), e.requiredSkills, true)}
      {section('preferred', t('mobile.cv.job.preferred'), e.preferredSkills, true)}
      {section('experience', t('mobile.cv.job.experience'), e.experience, false)}
      {section('education', t('mobile.cv.job.education'), e.education, false)}
      {section('responsibilities', t('mobile.cv.job.responsibilities'), e.responsibilities, false)}
    </View>
  );
}
