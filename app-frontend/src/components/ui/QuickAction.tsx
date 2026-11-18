import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { LineIcon, type LineIconName } from './LineIcon';

interface QuickActionProps {
  icon: LineIconName;
  label: string;
  onPress: () => void;
  /** Not available yet: dimmed, not pressable, with a small "Soon" note. */
  soonLabel?: string;
  testID?: string;
}

/** A Home quick-action tile (design 04): icon in a soft square above a short label. */
export function QuickAction({ icon, label, onPress, soonLabel, testID }: QuickActionProps) {
  const { colors, typography, spacing, radius } = useTheme();
  const disabled = soonLabel !== undefined;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${label}, ${soonLabel}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 104,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.input,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
        }}
      >
        <LineIcon name={icon} color={colors.primary} size={20} />
      </View>
      <Text style={[typography.labelMedium, { color: colors.text, textAlign: 'center' }]}>
        {label}
      </Text>
      {disabled ? (
        <Text style={[typography.labelSmall, { color: colors.textMuted }]}>{soonLabel}</Text>
      ) : null}
    </Pressable>
  );
}
