import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n/language';
import { Chip } from './Chip';

/**
 * English / Soomaali switch built from Chips; each option is written in its own
 * language. Changing it updates every screen at once (no restart).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.language.label')}
    >
      {LANGUAGES.map((language) => (
        <Chip
          key={language}
          testID={`language-${language}`}
          label={t(`common.language.${language}`)}
          selected={i18n.language === language}
          onPress={() => void i18n.changeLanguage(language)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
});
