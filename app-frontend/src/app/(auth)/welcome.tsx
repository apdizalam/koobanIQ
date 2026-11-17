import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';
import { AppLogo } from '../../components/ui/AppLogo';
import { Button } from '../../components/ui/Button';
import { TextLink } from '../../components/ui/TextLink';
import { useTheme } from '../../theme';

/** Figma "01 · Welcome": navy screen, logo, tagline, Get started / I already have an account. */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing, scheme } = useTheme();
  // Light mode follows Figma (navy page, white text); dark mode keeps the dark page.
  const light = scheme === 'light';
  const background = light ? colors.primary : colors.background;
  const text = light ? colors.onPrimary : colors.text;
  const muted = light ? 'rgba(255, 255, 255, 0.78)' : colors.textMuted;

  return (
    <Screen background={background}>
      <StatusBar style={light ? 'light' : 'auto'} />
      <View style={[styles.center, { gap: spacing.lg }]}>
        <AppLogo />
        <Text style={[typography.h1, styles.centerText, { color: text, fontSize: 26 }]}>
          {t('mobile.auth.appName')}
        </Text>
        <Text
          style={[typography.h3, styles.centerText, { color: text, fontSize: 18, lineHeight: 26 }]}
        >
          {t('mobile.auth.welcome.tagline')}
        </Text>
        <Text style={[typography.body, styles.centerText, { color: muted, maxWidth: 320 }]}>
          {t('mobile.auth.welcome.body')}
        </Text>
      </View>

      <View style={{ gap: spacing.xl }}>
        <Button
          variant="secondary"
          label={t('mobile.auth.welcome.start')}
          onPress={() => router.push('/language')}
          testID="welcome-start"
        />
        <TextLink
          label={t('mobile.auth.welcome.haveAccount')}
          color={text}
          onPress={() => router.push('/login')}
          testID="welcome-login"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
