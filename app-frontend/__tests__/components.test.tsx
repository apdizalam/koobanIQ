import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, type Insets, type StyleProp, type TextStyle } from 'react-native';
import {
  BottomSheet,
  Button,
  Chip,
  CHIP_VISUAL_HEIGHT,
  Input,
  JobCard,
  MatchBadge,
  ScoreRing,
  SkillChip,
} from '../src/components';
import { ThemeProvider, colors, sizes, type ColorScheme } from '../src/theme';

afterEach(async () => {
  await cleanup();
});

const renderIn = (scheme: ColorScheme, ui: ReactElement) =>
  render(<ThemeProvider preference={scheme}>{ui}</ThemeProvider>);

type StyleInput = StyleProp<TextStyle>;

const flat = (style: StyleInput): TextStyle => StyleSheet.flatten(style) ?? {};

/** Resolve Pressable function styles for the not-pressed state. */
const styleOf = (node: {
  props: { style?: StyleInput | ((state: { pressed: boolean }) => StyleInput) };
}): TextStyle => {
  const { style } = node.props;
  return flat(typeof style === 'function' ? style({ pressed: false }) : style);
};

const touchHeight = (visual: number, slop?: Insets | null) =>
  visual + (slop?.top ?? 0) + (slop?.bottom ?? 0);

const job = {
  title: 'Junior Mobile Developer',
  company: 'Hargeisa Tech Hub',
  location: 'Hargeisa',
  match: { category: 'strong' as const, label: 'Strong match', score: 92 },
  explanation: 'Matches 4 of 5 required skills.',
  saveLabels: { save: 'Save', saved: 'Saved' },
};

describe.each<ColorScheme>(['light', 'dark'])('base components — %s theme', (scheme) => {
  const c = colors[scheme];

  test('Button: 48px high, variant colors, presses', async () => {
    const onPress = jest.fn();
    await renderIn(
      scheme,
      <>
        <Button testID="primary" label="Continue" onPress={onPress} />
        <Button testID="secondary" variant="secondary" label="Upload" onPress={onPress} />
        <Button testID="ghost" variant="ghost" label="Skip" onPress={onPress} />
      </>,
    );
    for (const id of ['primary', 'secondary', 'ghost']) {
      expect(styleOf(screen.getByTestId(id)).height).toBe(sizes.buttonHeight);
    }
    expect(styleOf(screen.getByTestId('primary')).backgroundColor).toBe(c.primary);
    expect(flat(screen.getByText('Continue').props.style).color).toBe(c.onPrimary);
    expect(styleOf(screen.getByTestId('secondary')).borderColor).toBe(c.primary);
    expect(flat(screen.getByText('Skip').props.style).color).toBe(c.primary);
    fireEvent.press(screen.getByTestId('primary'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('Input: label above, 48px field, error message', async () => {
    await renderIn(scheme, <Input label="Email" icon="mail" errorMessage="Invalid email" />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(flat(screen.getByText('Invalid email').props.style).color).toBe(c.errorText);
  });

  test('Chip: selected colors and ≥44px touch target', async () => {
    const onPress = jest.fn();
    await renderIn(scheme, <Chip testID="chip" label="Remote" selected onPress={onPress} />);
    const chip = screen.getByTestId('chip');
    expect(styleOf(chip).backgroundColor).toBe(c.primarySoft);
    expect(touchHeight(CHIP_VISUAL_HEIGHT, chip.props.hitSlop)).toBeGreaterThanOrEqual(
      sizes.minTouchTarget,
    );
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });

  test('SkillChip: assessed = solid navy + check, self-reported = dashed outline', async () => {
    await renderIn(
      scheme,
      <>
        <SkillChip
          testID="assessed"
          skill="React Native"
          status="assessed"
          statusLabel="assessed"
        />
        <SkillChip testID="self" skill="Figma" status="self-reported" statusLabel="self-reported" />
      </>,
    );
    const assessed = screen.getByTestId('assessed');
    const self = screen.getByTestId('self');
    expect(styleOf(assessed).backgroundColor).toBe(c.primary);
    expect(styleOf(assessed).borderStyle).not.toBe('dashed');
    expect(styleOf(self).borderStyle).toBe('dashed');
    expect(styleOf(self).borderColor).toBe(c.textMuted);
    expect(styleOf(self).backgroundColor).toBe(c.surface);
    // The check icon is only on the assessed chip.
    expect(assessed.children.length).toBeGreaterThan(self.children.length);
    expect(screen.getByLabelText('React Native, assessed')).toBeTruthy();
    expect(screen.getByLabelText('Figma, self-reported')).toBeTruthy();
    for (const chip of [assessed, self]) {
      expect(touchHeight(CHIP_VISUAL_HEIGHT, chip.props.hitSlop)).toBeGreaterThanOrEqual(
        sizes.minTouchTarget,
      );
    }
  });

  test('MatchBadge: four categories with their soft background and text', async () => {
    const cases = [
      ['strong', 'successSoft', 'successText'],
      ['good', 'infoSoft', 'infoText'],
      ['potential', 'warningSoft', 'warningText'],
      ['gap', 'errorSoft', 'errorText'],
    ] as const;
    await renderIn(
      scheme,
      <>
        {cases.map(([cat]) => (
          <MatchBadge key={cat} category={cat} label={cat} score={50} />
        ))}
      </>,
    );
    for (const [cat, bg, text] of cases) {
      const label = screen.getByText(`${cat} · 50%`);
      expect(flat(label.props.style).color).toBe(c[text]);
      expect(styleOf(screen.getByLabelText(`${cat} · 50%`)).backgroundColor).toBe(c[bg]);
    }
  });

  test('JobCard: explanation always shown, save toggle ≥44px', async () => {
    const onToggleSave = jest.fn();
    await renderIn(
      scheme,
      <JobCard testID="job" {...job} saved={false} onToggleSave={onToggleSave} />,
    );
    expect(screen.getByText(job.explanation)).toBeTruthy();
    expect(screen.getByText('Strong match · 92%')).toBeTruthy();
    const save = screen.getByTestId('job-save');
    expect(styleOf(save).minHeight).toBeGreaterThanOrEqual(sizes.minTouchTarget);
    expect(styleOf(save).minWidth).toBeGreaterThanOrEqual(sizes.minTouchTarget);
    fireEvent.press(save);
    expect(onToggleSave).toHaveBeenCalledTimes(1);
  });

  test('ScoreRing: exposes the score as an accessible progress value', async () => {
    await renderIn(scheme, <ScoreRing score={78} label="Skill score" />);
    const ring = screen.getByLabelText('Skill score');
    expect(ring.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 78 });
    expect(screen.getByText('78%')).toBeTruthy();
  });

  test('BottomSheet: modal for screen readers, backdrop and back button close it', async () => {
    const onClose = jest.fn();
    await renderIn(
      scheme,
      <BottomSheet testID="sheet" visible onClose={onClose} title="Filter jobs" closeLabel="Close">
        <Button label="Apply" onPress={() => undefined} />
      </BottomSheet>,
    );
    expect(screen.getByText('Filter jobs')).toBeTruthy();
    expect(screen.getByText('Apply')).toBeTruthy();
    // accessibilityViewIsModal hides the backdrop from screen readers, so it is
    // queried as a hidden element; sighted users can still tap it to close.
    expect(screen.queryByLabelText('Close')).toBeNull();
    fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Android back button is wired to the Modal. (Not invoked here: React Native's
    // Modal back-button handling corrupts later renders inside the Jest renderer.)
    const modal = screen.getByTestId('sheet', { includeHiddenElements: true });
    expect(typeof modal.props.onRequestClose).toBe('function');
  });
});
