// Public theme API. Design tokens live only in this folder (single source of truth).
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './createTheme';
export { ThemeProvider, useTheme, type ThemePreference } from './ThemeProvider';
// Re-exported so existing `src/theme` imports keep working after the move to hooks/ and utils/.
export { useAppFonts } from '../hooks/useAppFonts';
export * from '../utils/contrast';
export { hitSlopFor } from '../utils/hitSlop';
