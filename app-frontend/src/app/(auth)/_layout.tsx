import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';

/**
 * Screens shown before signing in (architecture doc: Expo Router "(auth)" group).
 * A signed-in user who lands here (e.g. a link to Welcome) goes to Home instead.
 */
export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href="/home" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
