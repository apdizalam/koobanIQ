import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { LineIcon } from './LineIcon';

export interface ListRowProps {
  title: string;
  /** Second line (muted), e.g. "English · version 2 · 19 Nov 2026". */
  detail?: string;
  onPress: () => void;
  testID?: string;
}

/** A tappable card row with a chevron (Profile tab style), e.g. one CV or one job ad. */
export function ListRow({ title, detail, onPress, testID }: ListRowProps) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.card,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text numberOfLines={2} style={[typography.bodyStrong, { color: colors.text }]}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[typography.bodySmall, { color: colors.textMuted }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <LineIcon name="chevron-right" color={colors.textMuted} size={20} />
    </Pressable>
  );
}
