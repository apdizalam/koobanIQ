import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheet,
  Button,
  Chip,
  Input,
  JobCard,
  MatchBadge,
  ScoreRing,
  SkillChip,
} from '../components';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useTheme, type ColorScheme } from '../theme';
import type { MatchCategory } from '../types/match';

/**
 * Developer preview of the design system (TIQ-2). All text comes from the
 * shared translation files (packages/shared/i18n → mobile.preview).
 */
const CHIPS = ['somaliland', 'somalia', 'remote'] as const;
const MATCHES: { category: MatchCategory; score: number }[] = [
  { category: 'strong', score: 92 },
  { category: 'good', score: 78 },
  { category: 'potential', score: 61 },
  { category: 'gap', score: 40 },
];

interface Props {
  scheme: ColorScheme;
  onToggleScheme: () => void;
}

export function DesignSystemPreview({ scheme, onToggleScheme }: Props) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const [selectedChip, setSelectedChip] = useState<(typeof CHIPS)[number]>(CHIPS[0]);
  const [saved, setSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const noop = () => undefined;
  const match = (category: MatchCategory, score: number) => ({
    category,
    label: t(`mobile.preview.matches.${category}`),
    score,
  });

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.screen, gap: spacing.xxl, paddingTop: 56 }}
    >
      <LanguageSwitcher />
      <Text style={[typography.display, { color: colors.text }]}>{t('mobile.preview.title')}</Text>
      <Button
        variant="secondary"
        label={t(`mobile.preview.toggle.${scheme}`)}
        onPress={onToggleScheme}
      />

      <View style={styles.group}>
        <Button label={t('mobile.preview.buttons.primary')} onPress={noop} />
        <Button variant="secondary" label={t('mobile.preview.buttons.secondary')} onPress={noop} />
        <Button variant="ghost" label={t('mobile.preview.buttons.ghost')} onPress={noop} />
        <Button label={t('mobile.preview.buttons.loading')} onPress={noop} loading />
      </View>

      <View style={styles.group}>
        <Input
          label={t('mobile.preview.input.label')}
          icon="mail"
          placeholder={t('mobile.preview.input.placeholder')}
        />
        <Input
          label={t('mobile.preview.input.label')}
          icon="mail"
          placeholder={t('mobile.preview.input.placeholder')}
          errorMessage={t('mobile.preview.input.error')}
        />
      </View>

      <View style={styles.row}>
        {CHIPS.map((chip) => (
          <Chip
            key={chip}
            label={t(`mobile.preview.chips.${chip}`)}
            selected={chip === selectedChip}
            onPress={() => setSelectedChip(chip)}
          />
        ))}
      </View>

      <View style={styles.row}>
        <SkillChip
          skill={t('mobile.preview.skills.assessed')}
          status="assessed"
          statusLabel={t('mobile.preview.skills.assessedLabel')}
        />
        <SkillChip
          skill={t('mobile.preview.skills.selfReported')}
          status="self-reported"
          statusLabel={t('mobile.preview.skills.selfLabel')}
        />
      </View>

      <View style={styles.row}>
        {MATCHES.map((m) => (
          <MatchBadge key={m.category} {...match(m.category, m.score)} />
        ))}
      </View>

      <JobCard
        title={t('mobile.preview.job.title')}
        company={t('mobile.preview.job.company')}
        location={t('mobile.preview.job.location')}
        match={match('strong', 92)}
        explanation={t('mobile.preview.job.explanation')}
        saved={saved}
        saveLabels={{ save: t('mobile.preview.job.save'), saved: t('mobile.preview.job.saved') }}
        onToggleSave={() => setSaved((s) => !s)}
      />

      <ScoreRing score={78} label={t('mobile.preview.ring')} />

      <Button
        variant="secondary"
        label={t('mobile.preview.sheet.open')}
        onPress={() => setSheetOpen(true)}
      />
      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('mobile.preview.sheet.title')}
        closeLabel={t('mobile.preview.sheet.close')}
      >
        <Text style={[typography.body, { color: colors.text }]}>
          {t('mobile.preview.sheet.body')}
        </Text>
        <Button label={t('mobile.preview.sheet.close')} onPress={() => setSheetOpen(false)} />
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
