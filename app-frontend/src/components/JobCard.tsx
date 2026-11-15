import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { MatchBadge, type MatchCategory } from './MatchBadge';

export interface JobCardProps {
  title: string;
  company: string;
  location: string;
  match: { category: MatchCategory; label: string; score: number };
  /** Product rule 5: every match shows why it matched. Required. */
  explanation: string;
  saved: boolean;
  /** Translated text for the save toggle, e.g. { save: "Save", saved: "Saved" }. */
  saveLabels: { save: string; saved: string };
  onToggleSave: () => void;
  onPress?: () => void;
  testID?: string;
}

/**
 * Figma "JobCard" (Saved=No / Saved=Yes): card radius 16 · padding 16 · surface on
 * background · title, employer and location, MatchBadge and the match explanation.
 */
export function JobCard({
  title,
  company,
  location,
  match,
  explanation,
  saved,
  saveLabels,
  onToggleSave,
  onPress,
  testID,
}: JobCardProps) {
  const { colors, typography, radius, spacing, sizes } = useTheme();
  const saveText = saved ? saveLabels.saved : saveLabels.save;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: spacing.card,
          gap: spacing.md,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[typography.h3, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]} numberOfLines={1}>
            {`${company} · ${location}`}
          </Text>
        </View>
        <Pressable
          testID={testID ? `${testID}-save` : undefined}
          onPress={onToggleSave}
          accessibilityRole="button"
          accessibilityLabel={saveText}
          accessibilityState={{ selected: saved }}
          style={({ pressed }) => [
            styles.save,
            {
              minHeight: sizes.minTouchTarget,
              minWidth: sizes.minTouchTarget,
              borderRadius: radius.chip,
              backgroundColor: saved ? colors.primarySoft : 'transparent',
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <Text style={[typography.labelMedium, { color: colors.primary }]}>{saveText}</Text>
        </Pressable>
      </View>
      <MatchBadge category={match.category} label={match.label} score={match.score} />
      <Text style={[typography.bodySmall, { color: colors.textMuted }]}>{explanation}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, alignSelf: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  save: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
