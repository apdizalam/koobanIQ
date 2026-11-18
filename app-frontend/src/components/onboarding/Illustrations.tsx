import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from '../ui/Icon';
import { JobCard } from '../ui/JobCard';
import { SkillChip } from '../ui/SkillChip';

/** Soft panel behind each onboarding illustration (Figma "02 · Onboarding"). */
function Panel({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: colors.primarySoft,
          borderRadius: radius.sheet - 4,
          padding: spacing.lg,
        },
      ]}
    >
      {children}
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.md,
      }}
    >
      {children}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.legend}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[typography.bodySmall, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

/** Slide 1 (designed in Figma): assessed vs self-reported skill chips. */
export function SkillsIllustration() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <Panel>
      <Card>
        <View style={styles.cardTitle}>
          <Icon name="sparkle" size={18} color={colors.secondary} />
          <Text style={[typography.h3, { color: colors.text }]}>
            {t('mobile.auth.onboarding.skills.card')}
          </Text>
        </View>
        <View style={styles.chips}>
          <SkillChip
            skill="TypeScript"
            status="assessed"
            statusLabel={t('mobile.preview.skills.assessedLabel')}
          />
          <SkillChip
            skill="React Native"
            status="assessed"
            statusLabel={t('mobile.preview.skills.assessedLabel')}
          />
          <SkillChip
            skill="GraphQL"
            status="self-reported"
            statusLabel={t('mobile.preview.skills.selfLabel')}
          />
          <SkillChip
            skill="Node.js"
            status="self-reported"
            statusLabel={t('mobile.preview.skills.selfLabel')}
          />
        </View>
        <View style={{ gap: 4 }}>
          <Legend color={colors.primary} label={t('mobile.auth.onboarding.skills.assessed')} />
          <Legend
            color={colors.textMuted}
            label={t('mobile.auth.onboarding.skills.selfReported')}
          />
        </View>
      </Card>
    </Panel>
  );
}

/** Slide 2: a real job card that explains the match. */
export function JobsIllustration() {
  const { t } = useTranslation();
  return (
    <Panel>
      <JobCard
        title={t('mobile.auth.onboarding.jobs.jobTitle')}
        company={t('mobile.auth.onboarding.jobs.company')}
        location={t('mobile.auth.onboarding.jobs.location')}
        match={{ category: 'strong', label: t('mobile.auth.onboarding.jobs.match'), score: 92 }}
        explanation={t('mobile.auth.onboarding.jobs.explanation')}
        saved={false}
        saveLabels={{
          save: t('mobile.auth.onboarding.jobs.save'),
          saved: t('mobile.auth.onboarding.jobs.saved'),
        }}
        onToggleSave={() => undefined}
      />
    </Panel>
  );
}

/** Slide 3: a CV made for one job, approved before export. */
export function CvIllustration() {
  const { t } = useTranslation();
  const { colors, typography, radius } = useTheme();
  const line = (width: `${number}%`) => (
    <View style={{ height: 8, width, borderRadius: 4, backgroundColor: colors.border }} />
  );
  return (
    <Panel>
      <Card>
        <View style={styles.cardTitle}>
          <Text style={[typography.h3, { color: colors.text, flex: 1 }]} numberOfLines={2}>
            {t('mobile.auth.onboarding.cv.card')}
          </Text>
          <Text
            style={[
              typography.labelSmall,
              styles.pill,
              {
                color: colors.primary,
                backgroundColor: colors.primarySoft,
                borderRadius: radius.pill,
              },
            ]}
          >
            {t('mobile.auth.onboarding.cv.language')}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          {line('70%')}
          {line('95%')}
          {line('85%')}
          {line('60%')}
        </View>
        <View
          style={[
            styles.approve,
            { backgroundColor: colors.successSoft, borderRadius: radius.chip },
          ]}
        >
          <Icon name="check" size={14} color={colors.successText} />
          <Text style={[typography.labelMedium, { color: colors.successText }]}>
            {t('mobile.auth.onboarding.cv.approve')}
          </Text>
        </View>
      </Card>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'stretch' },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  approve: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
