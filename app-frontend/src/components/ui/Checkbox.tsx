import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from './Icon';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown under the box in the error color; also read out by screen readers. */
  errorMessage?: string;
  disabled?: boolean;
  testID?: string;
}

const BOX = 22;

/**
 * A tick box with its label (e.g. "I am 18 or older"). The whole row is the touch
 * target (at least 44px high) and screen readers announce it as a checkbox.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  errorMessage,
  disabled = false,
  testID,
}: CheckboxProps) {
  const { colors, typography, radius, sizes, spacing } = useTheme();
  const borderColor = errorMessage ? colors.error : checked ? colors.primary : colors.border;
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        testID={testID}
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={label}
        accessibilityHint={errorMessage}
        style={({ pressed }) => [
          styles.row,
          { minHeight: sizes.minTouchTarget, gap: spacing.md, opacity: pressed ? 0.78 : 1 },
        ]}
      >
        <View
          style={[
            styles.box,
            {
              borderRadius: radius.chip / 2,
              borderColor,
              backgroundColor: checked ? colors.primary : colors.surface,
            },
          ]}
        >
          {checked ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
        </View>
        <Text style={[typography.body, styles.label, { color: colors.text }]}>{label}</Text>
      </Pressable>
      {errorMessage ? (
        <Text
          style={[typography.bodySmall, { color: colors.errorText }]}
          accessibilityLiveRegion="polite"
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  box: {
    width: BOX,
    height: BOX,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
