import { StatusBar } from 'expo-status-bar';
import { useSchemeOverride } from '../hooks/useSchemeOverride';
import { DesignSystemPreview } from '../screens/DesignSystemPreview';
import { ThemeProvider } from '../theme';

/**
 * Developer page with every design-system component (TIQ-2). Not part of the
 * user flow; open it with the deep link kobaniq://design-system.
 */
export default function DesignSystemRoute() {
  const { scheme, toggleScheme } = useSchemeOverride();
  return (
    <ThemeProvider preference={scheme}>
      <DesignSystemPreview scheme={scheme} onToggleScheme={toggleScheme} />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
