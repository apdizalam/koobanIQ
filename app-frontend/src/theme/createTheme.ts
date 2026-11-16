import { colors, type ColorScheme, type ColorTokens } from './colors';
import { radius, sizes, spacing } from './spacing';
import { typography } from './typography';

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
