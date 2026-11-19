import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useProfile } from '../../profile/ProfileProvider';
import type { Profile } from '../../types/profile';
import { useTheme } from '../../theme';
import { Button } from '../ui/Button';

/**
 * Shows the children once the profile is loaded; a spinner while loading, and
 * an error with "Try again" if it could not be loaded.
 */
export function ProfileGate({ children }: { children: (profile: Profile) => ReactNode }) {
  const { t } = useTranslation();
  const { status, profile, reload } = useProfile();
  const { colors, typography, spacing, radius } = useTheme();

  if (profile) return <>{children(profile)}</>;
  if (status === 'error') {
    return (
      <View
        testID="profile-error"
        accessibilityRole="alert"
        style={{
          backgroundColor: colors.errorSoft,
          borderRadius: radius.card,
          padding: spacing.card,
          gap: spacing.md,
        }}
      >
        <Text style={[typography.body, { color: colors.errorText }]}>
          {t('mobile.profile.loadError')}
        </Text>
        <Button
          variant="secondary"
          label={t('mobile.home.error.retry')}
          onPress={() => void reload()}
          testID="profile-retry"
        />
      </View>
    );
  }
  return (
    <View
      testID="profile-loading"
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={{ paddingVertical: spacing.xxxl, alignItems: 'center' }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
