import { useState } from 'react';
import { useColorScheme } from 'react-native';
import type { ColorScheme } from '../theme/colors';

/**
 * Follows the device light/dark setting until the user flips it once;
 * after that the manual choice wins.
 */
export function useSchemeOverride(): { scheme: ColorScheme; toggleScheme: () => void } {
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [override, setOverride] = useState<ColorScheme | null>(null);
  const scheme = override ?? systemScheme;
  const toggleScheme = () => setOverride(scheme === 'light' ? 'dark' : 'light');
  return { scheme, toggleScheme };
}
