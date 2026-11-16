/** KOBANIQ layout tokens — Figma "Design System" → Foundations (spacing, radius, sizes). */

/** 4pt grid. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  /** Screen side padding. */
  screen: 20,
  /** Card inner padding. */
  card: 16,
} as const;

/** "Radius: chips/inputs 8 · buttons 12 · cards 16 · sheets 28" */
export const radius = {
  chip: 8,
  input: 8,
  button: 12,
  card: 16,
  sheet: 28,
  pill: 999,
} as const;

/** "buttons 48px · touch ≥ 44px · Icons 24px, 2px stroke" */
export const sizes = {
  buttonHeight: 48,
  inputHeight: 48,
  minTouchTarget: 44,
  icon: 24,
} as const;
