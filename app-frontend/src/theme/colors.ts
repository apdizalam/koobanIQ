/**
 * KOBANIQ color tokens — source of truth: Figma file EZGLzRn8AcpKGTPzfcQnjq,
 * page "Design System" → Foundations → Color.
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
