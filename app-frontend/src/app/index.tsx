import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../auth/authContext';
import { Splash } from '../components/layout/Splash';

/**
 * App start: wait for the saved session to be checked, then a signed-in user
 * goes to Home (or to Verify email when the server asks for it) and
 * everyone else starts at Welcome.
 */
export default function Index() {
  const { status, user } = useAuth();
  // "sent=1" right after sign-up: the confirm screen then waits before offering a new code.
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  if (status === 'restoring') return <Splash />;
  if (status === 'signedOut' || !user) return <Redirect href="/welcome" />;
  if (user.mustVerifyEmail) {
    return <Redirect href={{ pathname: '/verify-email', params: sent ? { sent } : {} }} />;
  }
  return <Redirect href="/home" />;
}
