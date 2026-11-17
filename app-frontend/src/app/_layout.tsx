import '../i18n';
import { Stack } from 'expo-router';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../hooks/useAppFonts';
import { ThemeProvider, colors } from '../theme';

/** Root of every screen: fonts, light/dark theme from the phone, translations, navigation. */
export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

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
    <SafeAreaProvider>
      <ThemeProvider preference="system">
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
