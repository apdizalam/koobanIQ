import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';
import { Splash } from '../../components/layout/Splash';

/** Screens for signed-in users only (architecture doc: Expo Router "(app)" group). */
export default function AppLayout() {
  const { status } = useAuth();
  if (status === 'restoring') return <Splash />;
  if (status === 'signedOut') return <Redirect href="/welcome" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
