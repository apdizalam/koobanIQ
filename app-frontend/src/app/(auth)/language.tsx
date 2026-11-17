import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { LANGUAGES } from '../../i18n/language';
import { useTheme } from '../../theme';

/**
 * User flow step "Choose language" (Notion 8 · User Flow). The phone's language
 * is pre-selected; tapping an option switches the whole app at once.
 */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing, radius, sizes } = useTheme();

  return (
    <Screen gap={spacing.xxl}>
      <StatusBar style="auto" />
      <BackButton />
      <View style={{ gap: spacing.sm }}>
        <Text style={[typography.display, { color: colors.text }]}>
          {t('mobile.auth.language.title')}
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {t('mobile.auth.language.subtitle')}
        </Text>
      </View>

      <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
        {LANGUAGES.map((language) => {
          const selected = i18n.language === language;
          return (
            <Pressable
              key={language}
              testID={`choose-${language}`}
              onPress={() => void i18n.changeLanguage(language)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.option,
                {
                  minHeight: sizes.buttonHeight + 8,
                  borderRadius: radius.button,
                  borderColor: selected ? colors.primary : colors.border,
                  borderWidth: selected ? 2 : 1,
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[typography.bodyStrong, { color: colors.text }]}>
                {t(`common.language.${language}`)}
              </Text>
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? colors.primary : colors.textMuted },
                ]}
              >
                {selected ? (
                  <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />
      <Button
        label={t('mobile.auth.language.continue')}
        onPress={() => router.push('/onboarding')}
        testID="language-continue"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  spacer: { flex: 1 },
});
