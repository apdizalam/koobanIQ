import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { BackButton } from '../ui/BackButton';

interface AuthScreenProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Pinned to the bottom of the screen (e.g. "New to KOBANIQ? Create an account"). */
  footer?: ReactNode;
  /** Show the back button (default). Off where there is nowhere to go back to. */
  showBack?: boolean;
}

/** Frame for Log in / Sign up: back button, title, form that stays above the keyboard. */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  showBack = true,
}: AuthScreenProps) {
  const { colors, typography, spacing } = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: spacing.screen, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {showBack ? <BackButton /> : null}
          <View style={{ gap: spacing.sm }}>
            <Text accessibilityRole="header" style={[typography.display, { color: colors.text }]}>
              {title}
            </Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>{subtitle}</Text>
          </View>
          {children}
          {footer ? (
            <>
              <View style={styles.fill} />
              <View style={styles.footer}>{footer}</View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
});
