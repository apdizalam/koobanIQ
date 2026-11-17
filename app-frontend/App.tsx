import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import './src/i18n';
import { useAppFonts } from './src/hooks/useAppFonts';
import { useSchemeOverride } from './src/hooks/useSchemeOverride';
import { DesignSystemPreview } from './src/screens/DesignSystemPreview';
import { ThemeProvider, colors } from './src/theme';

export default function App() {
  const fontsLoaded = useAppFonts();
  const { scheme, toggleScheme } = useSchemeOverride();

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors[scheme].background,
        }}
      >
        <ActivityIndicator color={colors[scheme].primary} />
      </View>
    );
  }

  return (
    <ThemeProvider preference={scheme}>
      <DesignSystemPreview scheme={scheme} onToggleScheme={toggleScheme} />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
