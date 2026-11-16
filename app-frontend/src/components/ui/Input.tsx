import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  icon?: IconName;
  /** Shown under the field in the error color; also marks the field invalid. */
  errorMessage?: string;
}

/** Figma "Input": label above · 48px field · radius 8 · padding 14 · icon 20 · Inter 15/22. */
export function Input({
  label,
  icon,
  errorMessage,
  onFocus,
  onBlur,
  ...textInputProps
}: InputProps) {
  const { colors, typography, radius, sizes, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = errorMessage ? colors.error : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
      <Text style={[typography.labelMedium, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            height: sizes.inputHeight,
            borderRadius: radius.input,
            borderColor,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={colors.textMuted} /> : null}
        <TextInput
          {...textInputProps}
          accessibilityLabel={label}
          accessibilityHint={errorMessage}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, typography.body, { color: colors.text }]}
        />
      </View>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: 0,
  },
});
