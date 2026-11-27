/// <reference types="node" />
// This test runs in Node (Vitest), so it may read files.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * TIQ-35: WCAG AA contrast of every text / background pair the landing page
 * uses, in the light and the dark theme, read straight from index.css.
 */
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

/** The custom properties of a CSS block (`:root { … }`). */
function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );
}

const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
/** The dark theme chosen with the switch (<html data-theme="dark">). */
const chosenStart = css.indexOf(":root[data-theme='dark'] {");
const darkBlock = css.slice(chosenStart, css.indexOf('}', chosenStart));
/** The same tokens for the device setting, used before / without the switch. */
const mediaStart = css.indexOf(":root:not([data-theme='light']) {");
const mediaBlock = css.slice(mediaStart, css.indexOf('}', mediaStart));
const light = tokens(lightBlock);
const THEMES = { light, dark: { ...light, ...tokens(darkBlock) } };

describe('light and dark themes', () => {
  it('the switch and the device setting give the same dark theme', () => {
    expect(chosenStart).toBeGreaterThan(0);
    expect(mediaStart).toBeGreaterThan(0);
    const body = (block: string) =>
      block
        .slice(block.indexOf('{') + 1)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    expect(body(mediaBlock)).toEqual(body(darkBlock));
    expect(Object.keys(tokens(darkBlock)).length).toBeGreaterThan(20);
  });

  it('colours are tokens: no fixed colour outside the token blocks', () => {
    const rules = css.slice(css.indexOf('*,'));
    expect(rules.match(/#[0-9a-f]{3,6}\b|rgba?\(/gi)).toBeNull();
  });
});

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [text, background, where] — tokens, or fixed colours starting with #. */
const TEXT_PAIRS: [string, string, string][] = [
  ['text', 'background', 'page text'],
  ['text', 'surface', 'cards, header, form'],
  ['text-muted', 'background', 'subtitles'],
  ['text-muted', 'surface', 'card text, FAQ answers'],
  ['text-muted', 'primary-soft', 'text on tinted sections'],
  ['text', 'primary-soft', 'headings on tinted sections'],
  ['steel-700', 'surface', 'links'],
  ['steel-700', 'background', 'links on the page'],
  ['on-primary', 'primary', 'primary button, active language'],
  ['success-text', 'success-soft', 'thank-you message, strong match'],
  ['error-text', 'error-soft', 'form error'],
  ['warning-text', 'warning-soft', 'draft notice, app-screen hints'],
  ['info-text', 'info-soft', 'app-screen notes, good match'],
  ['hero-text', 'hero-bg', 'hero text'],
  ['hero-muted', 'hero-bg', 'hero body text'],
  ['#1e3a5f', '#ffffff', 'hero "Join the waitlist" button'],
  ['#1e3a5f', '#e3eaf3', 'Android download badge on hover'],
];
/** Borders and icons that carry meaning (3:1). */
const UI_PAIRS: [string, string, string][] = [
  ['input-border', 'surface', 'form field borders'],
  ['text-muted', 'surface', 'dashed self-reported chips'],
  ['steel-700', 'primary-soft', 'feature icons'],
];

const color = (theme: Record<string, string>, name: string) =>
  name.startsWith('#') ? name : theme[name];

describe.each(Object.entries(THEMES))('landing contrast — %s theme', (_name, theme) => {
  it.each(TEXT_PAIRS)('text %s on %s (%s) ≥ 4.5:1', (fg, bg) => {
    expect(color(theme, fg), fg).toBeTruthy();
    expect(color(theme, bg), bg).toBeTruthy();
    expect(contrast(color(theme, fg), color(theme, bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)('UI %s on %s (%s) ≥ 3:1', (fg, bg) => {
    expect(contrast(color(theme, fg), color(theme, bg))).toBeGreaterThanOrEqual(3);
  });
});

it('the dark theme changes the main colours (it exists)', () => {
  expect(THEMES.dark.background).not.toBe(THEMES.light.background);
  expect(THEMES.dark.text).not.toBe(THEMES.light.text);
});
