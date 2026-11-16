import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme';
import { hitSlopFor } from '../../utils/hitSlop';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** Visual chip height (padding 7 + Label/Medium 18 line + 7). */
export const CHIP_VISUAL_HEIGHT = 32;

/**
 * Selectable chip (filters, regions, sources). Uses the chip radius 8 and
 * Label/Medium text from Figma; touch area is extended to 44px with hitSlop.
 */
export function Chip({ label, selected = false, onPress, testID }: ChipProps) {
  const { colors, typography, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={hitSlopFor(CHIP_VISUAL_HEIGHT)}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected } : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: CHIP_VISUAL_HEIGHT,
          borderRadius: radius.chip,
          backgroundColor: selected ? colors.primarySoft : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Text style={[typography.labelMedium, { color: selected ? colors.primary : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
});
