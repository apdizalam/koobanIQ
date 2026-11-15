/**
 * KOBANIQ design tokens — source of truth: Figma file EZGLzRn8AcpKGTPzfcQnjq,
 * page "Design System" → Foundations (colors, typography, radius, spacing).
 */

export type ColorScheme = 'light' | 'dark';

export interface ColorTokens {
  primary: string;
  onPrimary: string;
  secondary: string;
  steel700: string;
  primarySoft: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  error: string;
  errorSoft: string;
  errorText: string;
  info: string;
  infoSoft: string;
  infoText: string;
  /** Dimmed layer behind modal sheets. */
  overlay: string;
}

/** "Color — Light (bound variables)" */
export const lightColors: ColorTokens = {
  primary: '#1E3A5F',
  onPrimary: '#FFFFFF',
  secondary: '#4682B4',
  steel700: '#2F5F8A',
  primarySoft: '#E8EEF5',
  background: '#F4F7FA',
  surface: '#FFFFFF',
  text: '#202B38',
  textMuted: '#5A6778',
  border: '#DDE3EA',
  success: '#16A34A',
  successSoft: '#E7F6EC',
  // Figma has #15803D, which is 4.49:1 on successSoft (below WCAG AA 4.5:1 for
  // 13px badge text). #157F3C is 1% darker, visually identical, and 4.55:1.
  // TODO(design): update the Figma swatch to #157F3C.
  successText: '#157F3C',
  warning: '#F59E0B',
  warningSoft: '#FEF4E2',
  warningText: '#B45309',
  error: '#DC2626',
  errorSoft: '#FDECEC',
  errorText: '#B91C1C',
  info: '#0EA5E9',
  infoSoft: '#E6F6FD',
  infoText: '#0369A1',
  overlay: 'rgba(32, 43, 56, 0.48)',
};

/** "Color — Dark theme values (for code tokens)" */
export const darkColors: ColorTokens = {
  primary: '#8FB5DD',
  onPrimary: '#141C26',
  secondary: '#6FA3D2',
  steel700: '#9CC0E3',
  primarySoft: '#22344A',
  background: '#141C26',
  surface: '#1C2633',
  text: '#E6EDF5',
  textMuted: '#9AA8B8',
  border: '#2C3A4B',
  success: '#4ADE80',
  successSoft: '#16351F',
  successText: '#86EFAC',
  warning: '#FBBF24',
  warningSoft: '#3A2E12',
  warningText: '#FCD34D',
  error: '#F87171',
  errorSoft: '#3B1A1A',
  errorText: '#FCA5A5',
  info: '#38BDF8',
  infoSoft: '#0F2F3D',
  infoText: '#7DD3FC',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const colors: Record<ColorScheme, ColorTokens> = { light: lightColors, dark: darkColors };

/** Font families loaded in App (expo-google-fonts). Manrope = headings, Inter = UI. */
export const fontFamilies = {
  manropeSemiBold: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  manropeExtraBold: 'Manrope_800ExtraBold',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

/** Figma "Typography" (size / line height). */
export const typography = {
  display: { fontFamily: fontFamilies.manropeExtraBold, fontSize: 28, lineHeight: 36 },
  h1: { fontFamily: fontFamilies.manropeBold, fontSize: 22, lineHeight: 30 },
  h2: { fontFamily: fontFamilies.manropeBold, fontSize: 18, lineHeight: 26 },
  h3: { fontFamily: fontFamilies.manropeSemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamilies.interRegular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.interSemiBold, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fontFamilies.interRegular, fontSize: 13, lineHeight: 18 },
  labelMedium: { fontFamily: fontFamilies.interSemiBold, fontSize: 13, lineHeight: 18 },
  labelSmall: { fontFamily: fontFamilies.interMedium, fontSize: 11, lineHeight: 14 },
  button: { fontFamily: fontFamilies.interSemiBold, fontSize: 15, lineHeight: 20 },
} satisfies Record<string, TextStyleToken>;

export type TypographyToken = keyof typeof typography;

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

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  sizes: typeof sizes;
}

export const createTheme = (scheme: ColorScheme): Theme => ({
  scheme,
  colors: colors[scheme],
  typography,
  spacing,
  radius,
  sizes,
});
