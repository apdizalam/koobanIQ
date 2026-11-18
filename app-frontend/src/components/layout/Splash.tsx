import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { AppLogo } from '../ui/AppLogo';

/** Shown at launch while the saved session is checked, so Welcome never flashes for a signed-in user. */
export function Splash() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View
      testID="splash"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('mobile.auth.restoring')}
      style={[styles.root, { backgroundColor: colors.background, gap: spacing.xxl }]}
    >
      <AppLogo />
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
