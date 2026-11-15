import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type ColorTokens } from '../theme';

export type MatchCategory = 'strong' | 'good' | 'potential' | 'gap';

export interface MatchBadgeProps {
  category: MatchCategory;
  /** Translated category text, e.g. "Strong match". */
  label: string;
  /** Match score 0–100. */
  score: number;
}

const palette: Record<
  MatchCategory,
  { bg: keyof ColorTokens; text: keyof ColorTokens; dot: keyof ColorTokens }
> = {
  strong: { bg: 'successSoft', text: 'successText', dot: 'successText' },
  good: { bg: 'infoSoft', text: 'infoText', dot: 'infoText' },
  potential: { bg: 'warningSoft', text: 'warningText', dot: 'warningText' },
  gap: { bg: 'errorSoft', text: 'errorText', dot: 'errorText' },
};

/** Figma "MatchBadge": pill · 6px dot · Label/Medium · strong / good / potential / gap. */
export function MatchBadge({ category, label, score }: MatchBadgeProps) {
  const { colors, typography, radius } = useTheme();
  const tone = palette[category];
  const text = `${label} · ${Math.round(score)}%`;

  return (
    <View
      accessible
      accessibilityLabel={text}
      style={[styles.base, { backgroundColor: colors[tone.bg], borderRadius: radius.pill }]}
    >
      <View style={[styles.dot, { backgroundColor: colors[tone.dot] }]} />
      <Text style={[typography.labelMedium, { color: colors[tone.text] }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
