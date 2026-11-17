import { Text } from 'react-native';
import { useTheme } from '../../theme';

interface FormMessageProps {
  text: string;
  /** "error" = red box (failed request); "info" = blue box (feature not ready yet). */
  tone?: 'error' | 'info';
}

/** Message box under a form, read out by screen readers when it appears. */
export function FormMessage({ text, tone = 'error' }: FormMessageProps) {
  const { colors, typography, radius } = useTheme();
  const error = tone === 'error';
  return (
    <Text
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[
        typography.bodySmall,
        {
          color: error ? colors.errorText : colors.infoText,
          backgroundColor: error ? colors.errorSoft : colors.infoSoft,
          borderRadius: radius.input,
          paddingHorizontal: 12,
          paddingVertical: 10,
          overflow: 'hidden',
        },
      ]}
    >
      {text}
    </Text>
  );
}
