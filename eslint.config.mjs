// KOBANIQ — single ESLint config for the whole monorepo (ESLint flat config).
// Each area gets the rules for its runtime: browser React (admin, landing),
// React Native / Expo (mobile), and Node (backend, shared).
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier/flat';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SRC = '{js,jsx,mjs,cjs,ts,tsx}';
const WEB_APPS = [`Admin-dashboard/**/*.${SRC}`, `landing/**/*.${SRC}`];
const MOBILE_APP = [`app-frontend/**/*.${SRC}`];
const NODE_PACKAGES = [`backend/**/*.${SRC}`, `packages/shared/**/*.${SRC}`];
// Files that render UI (JSX may also live in .js files, as in Expo's template).
const UI_FILES = [
  `Admin-dashboard/src/**/*.${SRC}`,
  `landing/src/**/*.${SRC}`,
  `app-frontend/**/*.${SRC}`,
];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    'web-dist/',
    '**/build/',
    '**/.expo/',
    '**/web-build/',
    '**/android/',
    '**/ios/',
    '.husky/_/',
  ]),

  // Admin dashboard and landing page: React in the browser (Vite).
  {
    files: WEB_APPS,
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    // Vite config files run in Node, not the browser.
    files: [`Admin-dashboard/vite.config.${SRC}`, `landing/vite.config.${SRC}`],
    languageOptions: { globals: globals.node },
  },

  // Mobile app: Expo's official React Native rules (eslint-config-expo, SDK 58).
  {
    files: MOBILE_APP,
    extends: [expoConfig],
  },

  // Backend API and shared package: Node.js + TypeScript.
  {
    files: NODE_PACKAGES,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Root-level config files (this file, etc.).
  {
    files: [`*.${SRC}`],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Product rule: UI text must come from translation files (English + Somali).
  // Warning for now: every screen is still template text until i18n (TIQ-30).
  {
    files: UI_FILES,
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': ['warn', { mode: 'jsx-text-only' }] },
  },

  // Must be last: turn off stylistic rules that Prettier handles.
  prettierConfig,
]);
