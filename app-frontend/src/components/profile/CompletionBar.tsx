import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';

/** "Profile 60% complete" with a progress bar (Profile tab and Home). */
export function CompletionBar({ percent }: { percent: number }) {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View style={{ gap: spacing.sm }}>
      <Text testID="profile-completion" style={[typography.labelMedium, { color: colors.text }]}>
        {t('mobile.profile.completion', { percent: value })}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: value }}
        style={{
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: colors.primarySoft,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${value}%`, height: '100%', backgroundColor: colors.primary }} />
      </View>
    </View>
  );
}
