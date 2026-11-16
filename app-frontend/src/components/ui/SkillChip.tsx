import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme';
import type { SkillStatus } from '../../types/match';
import { hitSlopFor } from '../../utils/hitSlop';
import { CHIP_VISUAL_HEIGHT } from './Chip';
import { Icon } from './Icon';

export interface SkillChipProps {
  skill: string;
  status: SkillStatus;
  /** Spoken status text, e.g. "assessed" / "self-reported" (translated by the caller). */
  statusLabel: string;
  onPress?: () => void;
  testID?: string;
}

/**
 * Product rule 3 (Figma "SkillChip"): assessed = solid navy + check;
 * self-reported = dashed outline. Assessed and self-reported must always look different.
 */
export function SkillChip({ skill, status, statusLabel, onPress, testID }: SkillChipProps) {
  const { colors, typography, radius } = useTheme();
  const assessed = status === 'assessed';

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={hitSlopFor(CHIP_VISUAL_HEIGHT)}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${skill}, ${statusLabel}`}
      style={[
        styles.base,
        { borderRadius: radius.chip, minHeight: CHIP_VISUAL_HEIGHT },
        assessed
          ? { backgroundColor: colors.primary, gap: 6, borderWidth: 1, borderColor: colors.primary }
          : {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.textMuted,
            },
      ]}
    >
      {assessed ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
      <Text style={[typography.labelMedium, { color: assessed ? colors.onPrimary : colors.text }]}>
        {skill}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
  },
});
