import type en from '@kobaniq/shared/i18n/en.json';

// Typed keys: t('admin.login.title') is checked against the English file.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
