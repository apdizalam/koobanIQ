import en from '@kobaniq/shared/i18n/en.json';
import so from '@kobaniq/shared/i18n/so.json';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectLanguage, isLanguage, readStoredLanguage, storeLanguage } from './language';

/** Shared translation files (packages/shared/i18n), the same ones the other apps use. */
export const resources = { en: { translation: en }, so: { translation: so } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(
    readStoredLanguage(),
    typeof navigator === 'undefined' ? [] : navigator.languages,
  ),
  fallbackLng: 'en',
  // React already escapes text.
  interpolation: { escapeValue: false },
});

function applyLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  if (isLanguage(language)) storeLanguage(language);
}

applyLanguage(i18n.language);
i18n.on('languageChanged', applyLanguage);

export default i18n;
