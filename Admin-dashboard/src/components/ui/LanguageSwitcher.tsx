import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n/language';

/** English / Soomaali switch. Each option is written in its own language. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
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
            onClick={() => void i18n.changeLanguage(language)}
          >
            {t(`common.language.${language}`)}
          </button>
        );
      })}
    </div>
  );
}
