import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../../auth/authContext';
import { Screen } from '../../components/layout/Screen';
import { AppLogo } from '../../components/ui/AppLogo';
import { Button } from '../../components/ui/Button';
import { useTheme } from '../../theme';

/** Temporary signed-in page; the real Home (Figma 04) comes with its own task. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { colors, typography, spacing } = useTheme();
  const [busy, setBusy] = useState(false);

  async function logOut() {
    setBusy(true);
    await signOut();
    router.replace('/welcome');
  }

  return (
    <Screen gap={spacing.xl}>
      <StatusBar style="auto" />
      <AppLogo size={56} />
      <View style={{ gap: spacing.sm, flex: 1 }}>
        <Text accessibilityRole="header" style={[typography.display, { color: colors.text }]}>
          {t('mobile.auth.home.title')}
        </Text>
        <Text testID="home-email" style={[typography.body, { color: colors.textMuted }]}>
          {t('mobile.auth.home.body', { email: user?.email ?? '' })}
        </Text>
      </View>
      <Button
        variant="secondary"
        label={t('mobile.auth.home.logout')}
        onPress={() => void logOut()}
        loading={busy}
        testID="home-logout"
      />
    </Screen>
  );
}
