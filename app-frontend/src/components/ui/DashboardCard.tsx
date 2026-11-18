import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { TextLink } from './TextLink';

interface DashboardCardProps {
  title: string;
  /** Main text, e.g. the empty-state explanation. */
  body?: string;
  /** Optional link at the bottom (e.g. "Find jobs"). */
  action?: { label: string; onPress: () => void; testID?: string };
  children?: ReactNode;
  testID?: string;
}

/** A Home card (PRD FR-DASH-01/03): title, content or empty-state text, optional action. */
export function DashboardCard({ title, body, action, children, testID }: DashboardCardProps) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.sm,
      }}
    >
      <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
        {title}
      </Text>
      {body ? <Text style={[typography.body, { color: colors.textMuted }]}>{body}</Text> : null}
      {children}
      {action ? (
        <TextLink
          label={action.label}
          onPress={action.onPress}
          testID={action.testID}
          align="flex-start"
        />
      ) : null}
    </View>
  );
}
