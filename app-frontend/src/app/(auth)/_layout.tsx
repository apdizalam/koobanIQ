import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';

/**
 * Screens shown before signing in (architecture doc: Expo Router "(auth)" group).
 * A signed-in user who lands here (e.g. a link to Welcome) goes to Home, or to
 * Verify email if the email isn't confirmed yet.
 */
export default function AuthLayout() {
  const { status, user } = useAuth();
  if (status === 'signedIn' && user) {
    return <Redirect href={user.emailVerified ? '/home' : '/verify-email'} />;
  }
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
