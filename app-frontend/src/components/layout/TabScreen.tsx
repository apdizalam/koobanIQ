import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

interface TabScreenProps {
  title: string;
  /** Small line under the title. */
  subtitle?: string;
  subtitleTestID?: string;
  children: ReactNode;
  /** Pull-to-refresh; left out on screens with nothing to reload. */
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
}

/**
 * A screen inside the bottom tabs: top safe area only (the tab bar covers the
 * bottom), page title, scrolling content with the 20px side padding.
 */
export function TabScreen({
  title,
  subtitle,
  subtitleTestID,
  children,
  refreshing = false,
  onRefresh,
  testID,
}: TabScreenProps) {
  const { colors, typography, spacing } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar style="auto" />
      <ScrollView
        testID={testID}
        contentContainerStyle={{
          paddingHorizontal: spacing.screen,
          paddingVertical: spacing.lg,
          gap: spacing.lg,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text testID={subtitleTestID} style={[typography.body, { color: colors.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
