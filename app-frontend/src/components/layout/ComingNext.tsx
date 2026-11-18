import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { BackButton } from '../ui/BackButton';
import { Screen } from './Screen';

/** Temporary screen for routes that the next slice of TIQ-5 builds (Log in, Sign up). */
export function ComingNext({ testID }: { testID: string }) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  return (
    <Screen gap={spacing.xxl}>
      <StatusBar style="auto" />
      <BackButton />
      <View style={{ gap: spacing.sm }} testID={testID}>
        <Text style={[typography.h1, { color: colors.text }]}>
          {t('mobile.auth.placeholder.title')}
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {t('mobile.auth.placeholder.body')}
        </Text>
      </View>
    </Screen>
  );
}
