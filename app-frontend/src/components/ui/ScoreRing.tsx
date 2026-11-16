import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme';

export interface ScoreRingProps {
  /** Score 0–100. */
  score: number;
  /** Accessible description, e.g. "Skill score" (translated by the caller). */
  label: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Circular score indicator for assessment and match scores. Built from the
 * design tokens (primary progress on a border-colored track, Manrope heading number).
 */
export function ScoreRing({ score, label, size = 72, strokeWidth = 8 }: ScoreRingProps) {
  const { colors, typography } = useTheme();
  const value = Math.min(100, Math.max(0, Math.round(score)));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}%` }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[typography.h2, { color: colors.text }]}>{`${value}%`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
