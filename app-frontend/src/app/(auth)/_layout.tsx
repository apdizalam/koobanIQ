import { Stack } from 'expo-router';

/** Screens shown before signing in (architecture doc: Expo Router "(auth)" group). */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
