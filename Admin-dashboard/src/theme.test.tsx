/// <reference types="node" />
// Runs in Node (Vitest): reads files, renders to a string, runs the init script in a sandbox.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './components/ui/ThemeToggle';
import i18n, { resources } from './i18n';
import { THEME_KEY, currentTheme, setTheme } from './theme';

/** <html> with attributes, storage and the device setting, as theme-init.js sees them. */
function fakeBrowser(saved: string | null, deviceDark: boolean) {
  const attrs = new Map<string, string>();
  const store = new Map<string, string>(saved ? [[THEME_KEY, saved]] : []);
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as unknown as Storage;
  const doc = {
    documentElement: {
      getAttribute: (n: string) => attrs.get(n) ?? null,
      setAttribute: (n: string, v: string) => void attrs.set(n, v),
    },
  } as unknown as Document;
  const window = {
    localStorage: storage,
    matchMedia: () => ({ matches: deviceDark, addEventListener: () => undefined }),
  };
  return { doc, window, storage, store };
}

const init = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
const runInit = (b: ReturnType<typeof fakeBrowser>) => {
  runInNewContext(init, { window: b.window, document: b.doc });
  return currentTheme(b.doc);
};

describe('admin light / dark theme', () => {
  it('the theme is set before the first paint: saved choice first, else the device', () => {
    expect(runInit(fakeBrowser('light', true))).toBe('light');
    expect(runInit(fakeBrowser('dark', false))).toBe('dark');
    expect(runInit(fakeBrowser(null, true))).toBe('dark');
    expect(runInit(fakeBrowser(null, false))).toBe('light');
  });

  it('a choice survives a refresh (same storage key as the landing page)', () => {
    const b = fakeBrowser(null, false);
    runInit(b);
    setTheme('dark', b.doc, b.storage);
    expect(b.store.get('kobaniq-theme')).toBe('dark');
    expect(runInit(fakeBrowser(b.store.get(THEME_KEY) ?? null, false))).toBe('dark');
  });

  it('the script is in <head>, under the /admin base, before the app', () => {
    const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(page).toContain('<script src="%BASE_URL%theme-init.js"></script>');
    expect(page.indexOf('theme-init.js')).toBeLessThan(page.indexOf('/src/main.tsx'));
  });

  it('the switch has its label in English and Somali, and the language stays as chosen', async () => {
    for (const lang of ['en', 'so'] as const) {
      await i18n.changeLanguage(lang);
      const label = resources[lang].translation.admin.shell.darkMode;
      expect(label).toBeTruthy();
      const html = renderToString(
        <I18nextProvider i18n={i18n}>
          <ThemeToggle />
        </I18nextProvider>,
      );
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain('aria-pressed=');
      expect(i18n.language).toBe(lang);
    }
    await i18n.changeLanguage('en');
  });

  it('the switch sits next to the language switch on every admin page and the login page', () => {
    for (const file of ['./components/layout/AdminLayout.tsx', './pages/LoginPage.tsx']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src.indexOf('<ThemeToggle />'), file).toBeGreaterThan(0);
      expect(src.indexOf('<ThemeToggle />') < src.indexOf('<LanguageSwitcher />'), file).toBe(true);
    }
  });
});
