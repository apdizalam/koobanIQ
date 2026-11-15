import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { DesignSystemPreview } from './src/screens/DesignSystemPreview';
import { ThemeProvider, colors, useAppFonts, type ColorScheme } from './src/theme';

export default function App() {
  const fontsLoaded = useAppFonts();
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [override, setOverride] = useState<ColorScheme | null>(null);
  const scheme = override ?? systemScheme;

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
      <DesignSystemPreview
        scheme={scheme}
        onToggleScheme={() => setOverride(scheme === 'light' ? 'dark' : 'light')}
      />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
