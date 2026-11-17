import { Pressable, Text } from 'react-native';
import { useTheme } from '../../theme';
import { hitSlopFor } from '../../utils/hitSlop';

interface TextLinkProps {
  label: string;
  onPress: () => void;
  /** Text colour; defaults to the primary colour. */
  color?: string;
  testID?: string;
  /** Where it sits in its row (default: centred). */
  align?: 'center' | 'flex-start' | 'flex-end';
}

/** Text-only button ("Skip", "I already have an account") with a 44px touch area. */
export function TextLink({ label, onPress, color, testID, align = 'center' }: TextLinkProps) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlopFor(20, 60)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, alignSelf: align })}
    >
      <Text style={[typography.button, { color: color ?? colors.primary }]}>{label}</Text>
    </Pressable>
  );
}
