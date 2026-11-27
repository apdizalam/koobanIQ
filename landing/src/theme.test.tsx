/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from './components/Header';
import { LANGS } from './routes';
import { TEXTS } from './texts';
import { THEME_KEY, currentTheme, isTheme, setTheme } from './theme';

/** A tiny stand-in for the browser: <html> with attributes, storage, device setting. */
function fakeBrowser(opts: { saved?: string | null; deviceDark?: boolean; blocked?: boolean }) {
  const attrs = new Map<string, string>();
  const store = new Map<string, string>();
  if (opts.saved != null) store.set(THEME_KEY, opts.saved);
  const listeners: (() => void)[] = [];
  const media = {
    matches: !!opts.deviceDark,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  };
  const storage = {
    getItem: (k: string) => {
      if (opts.blocked) throw new Error('blocked');
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.blocked) throw new Error('blocked');
      store.set(k, v);
    },
  } as unknown as Storage;
  const doc = {
    documentElement: {
      getAttribute: (n: string) => attrs.get(n) ?? null,
      setAttribute: (n: string, v: string) => attrs.set(n, v),
    },
  } as unknown as Document;
  const window = { localStorage: storage, matchMedia: () => media };
  return { doc, window, storage, store, media, listeners };
}

const initScript = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
/** Runs public/theme-init.js as the browser would, before the page is drawn. */
function runInit(browser: ReturnType<typeof fakeBrowser>) {
  runInNewContext(initScript, { window: browser.window, document: browser.doc });
  return currentTheme(browser.doc);
}

describe('theme before the first paint (public/theme-init.js)', () => {
  it('a saved choice wins over the device setting', () => {
    expect(runInit(fakeBrowser({ saved: 'light', deviceDark: true }))).toBe('light');
    expect(runInit(fakeBrowser({ saved: 'dark', deviceDark: false }))).toBe('dark');
  });

  it('no choice (or a broken value): follows the device, also when it changes', () => {
    expect(runInit(fakeBrowser({ deviceDark: false }))).toBe('light');
    const b = fakeBrowser({ saved: 'purple', deviceDark: true });
    expect(runInit(b)).toBe('dark');
    b.media.matches = false;
    b.listeners.forEach((fn) => fn());
    expect(currentTheme(b.doc)).toBe('light');
  });

  it('blocked storage still gives a theme (the device setting)', () => {
    expect(runInit(fakeBrowser({ blocked: true, deviceDark: true }))).toBe('dark');
  });
});

describe('switching (src/theme.ts)', () => {
  it('switching shows the theme and keeps it for the next visit (refresh)', () => {
    const b = fakeBrowser({ deviceDark: false });
    runInit(b);
    setTheme('dark', b.doc, b.storage);
    expect(currentTheme(b.doc)).toBe('dark');
    expect(b.store.get(THEME_KEY)).toBe('dark');
    // "Refresh": a new page reads the saved choice, even though the device is light.
    const after = fakeBrowser({ saved: b.store.get(THEME_KEY), deviceDark: false });
    expect(runInit(after)).toBe('dark');
    // A chosen theme no longer follows the device.
    after.media.matches = true;
    after.listeners.forEach((fn) => fn());
    setTheme('light', after.doc, after.storage);
    after.listeners.forEach((fn) => fn());
    expect(currentTheme(after.doc)).toBe('light');
  });

  it('blocked storage: the switch still works on this page', () => {
    const b = fakeBrowser({ blocked: true });
    expect(() => setTheme('dark', b.doc, b.storage)).not.toThrow();
    expect(currentTheme(b.doc)).toBe('dark');
    expect(isTheme('dark') && isTheme('light') && !isTheme('auto')).toBe(true);
  });
});

describe('theme switch in the header', () => {
  for (const lang of LANGS) {
    it(`${lang}: one small labelled button with both icons, next to the language switch`, () => {
      const t = TEXTS[lang];
      const html = renderToString(<Header t={t} lang={lang} page="home" />);
      expect(html).toContain(`class="theme-toggle" aria-label="${t.nav.darkMode}"`);
      expect(html).toContain('theme-icon-moon');
      expect(html).toContain('theme-icon-sun');
      expect(html.indexOf('theme-toggle')).toBeLessThan(html.indexOf('lang-switch'));
      // The language links are untouched by the theme.
      expect(html).toContain('hrefLang="so"');
    });
  }

  it('the theme script loads before anything is drawn', () => {
    const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const head = page.slice(0, page.indexOf('</head>'));
    expect(head).toContain('<script src="/theme-init.js"></script>');
    expect(head.indexOf('/theme-init.js')).toBeLessThan(page.indexOf('<body>'));
  });
});
