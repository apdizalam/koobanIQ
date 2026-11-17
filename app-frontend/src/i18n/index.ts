import en from '@kobaniq/shared/i18n/en.json';
import so from '@kobaniq/shared/i18n/so.json';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectLanguage } from './language';

/** Shared translation files (packages/shared/i18n), the same ones the admin and server use. */
export const resources = { en: { translation: en }, so: { translation: so } } as const;

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(getLocales().map((locale) => locale.languageCode)),
  fallbackLng: 'en',
  // React Native renders plain text, so nothing to escape.
  interpolation: { escapeValue: false },
});

export default i18n;
