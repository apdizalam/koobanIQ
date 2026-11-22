/// <reference types="node" />
// This test runs in Node (Vitest), so it may read files.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * TIQ-35: WCAG AA contrast of every text / background pair the admin
 * dashboard uses, in the light and the dark theme, read from index.css.
 */
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );
}

const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const darkBlock = css.slice(darkStart, css.indexOf('}', css.indexOf(':root {', darkStart)));
const light = tokens(lightBlock);
const THEMES = { light, dark: { ...light, ...tokens(darkBlock) } };

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

const TEXT_PAIRS: [string, string, string][] = [
  ['text', 'bg', 'page text'],
  ['text', 'surface', 'cards, tables, dialogs'],
  ['text-muted', 'bg', 'subtitles, notes'],
  ['text-muted', 'surface', 'table notes, hints'],
  ['on-primary', 'primary', 'primary button, admin badge, active segment'],
  ['primary', 'surface', 'links, secondary buttons'],
  ['primary', 'bg', 'links on the page'],
  ['primary', 'primary-soft', 'active nav link, user badge'],
  ['success-text', 'success-soft', 'notices, active badge'],
  ['warning-text', 'warning-soft', 'suspended / test / partial badges'],
  ['error-text', 'error-soft', 'alerts'],
  ['error-text', 'surface', 'over-limit counters'],
  ['on-error', 'error', 'danger buttons (delete, suspend)'],
];
const UI_PAIRS: [string, string, string][] = [['primary', 'surface', 'focus outlines, checkboxes']];

describe.each(Object.entries(THEMES))('admin contrast — %s theme', (_name, theme) => {
  it.each(TEXT_PAIRS)('text %s on %s (%s) ≥ 4.5:1', (fg, bg) => {
    expect(theme[fg], fg).toBeTruthy();
    expect(theme[bg], bg).toBeTruthy();
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)('UI %s on %s (%s) ≥ 3:1', (fg, bg) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(3);
  });
});
