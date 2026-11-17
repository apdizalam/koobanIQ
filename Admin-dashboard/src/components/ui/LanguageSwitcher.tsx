import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/authContext';
import { markLanguageChosenWhileSignedOut } from '../../auth/languageSync';
import { LANGUAGES, type Language } from '../../i18n/language';

/**
 * English / Soomaali switch. Each option is written in its own language.
 * Signed in, the choice is saved to the account (see AuthProvider).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  function choose(language: Language) {
    if (!user) markLanguageChosenWhileSignedOut();
    void i18n.changeLanguage(language);
  }

  return (
    <div className="segmented segmented-small" role="group" aria-label={t('common.language.label')}>
      {LANGUAGES.map((language) => {
        const active = i18n.language === language;
        return (
          <button
            key={language}
            type="button"
            lang={language}
            className={`segment${active ? ' segment-active' : ''}`}
            aria-pressed={active}
            onClick={() => choose(language)}
          >
            {t(`common.language.${language}`)}
          </button>
        );
      })}
    </div>
  );
}
