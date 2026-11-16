import { useState } from 'react';
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
import { useTheme, type ColorScheme } from '../theme';

/**
 * Developer preview of the design system (TIQ-2). Sample text lives in one
 * object so it can move to the translation files when i18n lands (TIQ-30).
 */
const sample = {
  title: 'KOBANIQ design system',
  toggle: { light: 'Switch to dark', dark: 'Switch to light' },
  buttons: {
    primary: 'Continue',
    secondary: 'Upload CV',
    ghost: 'Skip for now',
    loading: 'Saving',
  },
  input: { label: 'Email', placeholder: 'you@example.com', error: 'Enter a valid email address' },
  chips: ['Somaliland', 'Somalia', 'Remote'],
  skills: {
    assessed: 'React Native',
    selfReported: 'Figma',
    assessedLabel: 'assessed',
    selfLabel: 'self-reported',
  },
  matches: [
    { category: 'strong', label: 'Strong match', score: 92 },
    { category: 'good', label: 'Good match', score: 78 },
    { category: 'potential', label: 'Potential', score: 61 },
    { category: 'gap', label: 'Skill gap', score: 40 },
  ] as const,
  job: {
    title: 'Junior Mobile Developer',
    company: 'Hargeisa Tech Hub',
    location: 'Hargeisa',
    explanation: 'Matches 4 of 5 required skills: React Native, TypeScript, Git, REST APIs.',
    save: { save: 'Save', saved: 'Saved' },
  },
  ring: 'Skill score',
  sheet: {
    open: 'Open bottom sheet',
    title: 'Filter jobs',
    close: 'Close',
    body: 'Sheet content goes here.',
  },
};

interface Props {
  scheme: ColorScheme;
  onToggleScheme: () => void;
}

export function DesignSystemPreview({ scheme, onToggleScheme }: Props) {
  const { colors, typography, spacing } = useTheme();
  const [selectedChip, setSelectedChip] = useState(sample.chips[0]);
  const [saved, setSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const noop = () => undefined;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.screen, gap: spacing.xxl, paddingTop: 56 }}
    >
      <Text style={[typography.display, { color: colors.text }]}>{sample.title}</Text>
      <Button variant="secondary" label={sample.toggle[scheme]} onPress={onToggleScheme} />

      <View style={styles.group}>
        <Button label={sample.buttons.primary} onPress={noop} />
        <Button variant="secondary" label={sample.buttons.secondary} onPress={noop} />
        <Button variant="ghost" label={sample.buttons.ghost} onPress={noop} />
        <Button label={sample.buttons.loading} onPress={noop} loading />
      </View>

      <View style={styles.group}>
        <Input label={sample.input.label} icon="mail" placeholder={sample.input.placeholder} />
        <Input
          label={sample.input.label}
          icon="mail"
          placeholder={sample.input.placeholder}
          errorMessage={sample.input.error}
        />
      </View>

      <View style={styles.row}>
        {sample.chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            selected={chip === selectedChip}
            onPress={() => setSelectedChip(chip)}
          />
        ))}
      </View>

      <View style={styles.row}>
        <SkillChip
          skill={sample.skills.assessed}
          status="assessed"
          statusLabel={sample.skills.assessedLabel}
        />
        <SkillChip
          skill={sample.skills.selfReported}
          status="self-reported"
          statusLabel={sample.skills.selfLabel}
        />
      </View>

      <View style={styles.row}>
        {sample.matches.map((m) => (
          <MatchBadge key={m.category} category={m.category} label={m.label} score={m.score} />
        ))}
      </View>

      <JobCard
        title={sample.job.title}
        company={sample.job.company}
        location={sample.job.location}
        match={sample.matches[0]}
        explanation={sample.job.explanation}
        saved={saved}
        saveLabels={sample.job.save}
        onToggleSave={() => setSaved((s) => !s)}
      />

      <ScoreRing score={78} label={sample.ring} />

      <Button variant="secondary" label={sample.sheet.open} onPress={() => setSheetOpen(true)} />
      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sample.sheet.title}
        closeLabel={sample.sheet.close}
      >
        <Text style={[typography.body, { color: colors.text }]}>{sample.sheet.body}</Text>
        <Button label={sample.sheet.close} onPress={() => setSheetOpen(false)} />
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
