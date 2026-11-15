import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Figma: Primary (Navy CTA — one per screen), Secondary (outlined), Ghost (text). */
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/** Figma "Button": 48px high · radius 12 · horizontal padding 20 · Inter SemiBold 15/20. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  testID,
}: ButtonProps) {
  const { colors, typography, radius, sizes } = useTheme();
  const isPrimary = variant === 'primary';
  const textColor = isPrimary ? colors.onPrimary : colors.primary;
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: sizes.buttonHeight,
          borderRadius: radius.button,
          backgroundColor: isPrimary
            ? colors.primary
            : variant === 'secondary'
              ? colors.surface
              : 'transparent',
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderColor: colors.primary,
          // Figma "Confirmed" state uses 78% opacity; reused for pressed/disabled.
          opacity: pressed || inactive ? 0.78 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[typography.button, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
