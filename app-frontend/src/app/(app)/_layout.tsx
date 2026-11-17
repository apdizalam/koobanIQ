import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';

/** Screens for signed-in users only (architecture doc: Expo Router "(app)" group). */
export default function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/welcome" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
