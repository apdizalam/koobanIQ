import { Pressable, Text, View } from 'react-native';
import { optionLetter } from '../../services/quizApi';
import { useTheme } from '../../theme';

export type OptionState = 'idle' | 'selected' | 'right' | 'wrong';

interface QuizOptionProps {
  index: number;
  label: string;
  state: OptionState;
  /** Off once the answer is checked. */
  onPress?: () => void;
  /** Read out after checking, e.g. "Correct answer". */
  stateLabel?: string;
  testID?: string;
}

/**
 * One answer option (design "08 · Assessment — Question"): letter badge and
 * text; selected = navy border on soft navy; after checking, the right option
 * is green and a wrong choice red.
 */
export function QuizOption({ index, label, state, onPress, stateLabel, testID }: QuizOptionProps) {
  const { colors, typography, spacing, radius, sizes } = useTheme();
  const look = {
    idle: {
      bg: colors.surface,
      border: colors.border,
      badgeBg: colors.surface,
      badgeFg: colors.text,
    },
    selected: {
      bg: colors.primarySoft,
      border: colors.primary,
      badgeBg: colors.primary,
      badgeFg: colors.onPrimary,
    },
    right: {
      bg: colors.successSoft,
      border: colors.success,
      badgeBg: colors.success,
      badgeFg: colors.onPrimary,
    },
    wrong: {
      bg: colors.errorSoft,
      border: colors.error,
      badgeBg: colors.error,
      badgeFg: colors.onPrimary,
    },
  }[state];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: state !== 'idle', disabled: !onPress }}
      accessibilityLabel={`${optionLetter(index)}. ${label}${stateLabel ? `, ${stateLabel}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.minTouchTarget + 12,
        paddingHorizontal: spacing.card,
        paddingVertical: spacing.md,
        borderRadius: radius.card,
        borderWidth: state === 'idle' ? 1 : 2,
        borderColor: look.border,
        backgroundColor: look.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.chip,
          borderWidth: 1,
          borderColor: state === 'idle' ? colors.border : look.badgeBg,
          backgroundColor: look.badgeBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.labelMedium, { color: look.badgeFg }]}>{optionLetter(index)}</Text>
      </View>
      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
