import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

interface ScreenProps {
  children: ReactNode;
  /** Background colour; defaults to the theme background. */
  background?: string;
  /** Space between the main children. */
  gap?: number;
  style?: ViewStyle;
}

/** Full-screen page: safe-area padding (notch, home bar) and the 20px side padding. */
export function Screen({ children, background, gap, style }: ScreenProps) {
  const { colors, spacing } = useTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: background ?? colors.background }]}
      edges={['top', 'bottom']}
    >
      <View
        style={[
          styles.body,
          { paddingHorizontal: spacing.screen, paddingVertical: spacing.lg, gap },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
});
