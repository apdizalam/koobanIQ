import {
  WCAG_AA_NON_TEXT,
  WCAG_AA_TEXT,
  colors,
  contrastRatio,
  type ColorScheme,
  type ColorTokens,
} from '../src/theme';

type Pair = [foreground: keyof ColorTokens, background: keyof ColorTokens, usedBy: string];

/** Every text color / background combination the base components render. */
const TEXT_PAIRS: Pair[] = [
  ['text', 'background', 'screen text'],
  ['text', 'surface', 'card/input/chip text'],
  ['textMuted', 'background', 'secondary text on screen'],
  ['textMuted', 'surface', 'JobCard meta, Input placeholder and icon'],
  ['onPrimary', 'primary', 'Primary Button, assessed SkillChip'],
  ['primary', 'surface', 'Secondary Button, JobCard save'],
  ['primary', 'background', 'Ghost Button'],
  ['primary', 'primarySoft', 'selected Chip, saved JobCard'],
  ['successText', 'successSoft', 'MatchBadge strong'],
  ['infoText', 'infoSoft', 'MatchBadge good'],
  ['warningText', 'warningSoft', 'MatchBadge potential'],
  ['errorText', 'errorSoft', 'MatchBadge gap'],
  ['errorText', 'background', 'Input error message'],
  ['errorText', 'surface', 'Input error message in a card/sheet'],
];

/** Non-text UI that carries meaning (WCAG 1.4.11, 3:1). */
const NON_TEXT_PAIRS: Pair[] = [
  ['textMuted', 'surface', 'self-reported SkillChip dashed outline'],
  ['primary', 'surface', 'focused Input border, ScoreRing progress'],
  ['error', 'surface', 'invalid Input border'],
];

describe.each<ColorScheme>(['light', 'dark'])('WCAG AA contrast — %s theme', (scheme) => {
  const palette = colors[scheme];

  test.each(TEXT_PAIRS)('text %s on %s (%s) ≥ 4.5:1', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  test.each(NON_TEXT_PAIRS)('UI %s on %s (%s) ≥ 3:1', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
  });
});

describe('contrastRatio', () => {
  test('matches known WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});
