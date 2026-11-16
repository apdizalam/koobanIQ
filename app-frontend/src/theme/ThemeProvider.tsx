import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ColorScheme } from './colors';
import { createTheme, type Theme } from './createTheme';

export type ThemePreference = ColorScheme | 'system';

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  /** 'system' follows the device setting (default). */
  preference?: ThemePreference;
  children: ReactNode;
}

export function ThemeProvider({ preference = 'system', children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const theme = useMemo(() => createTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return theme;
}
