import { Redirect } from 'expo-router';
import { useAuth } from '../auth/authContext';
import { Splash } from '../components/layout/Splash';

/**
 * App start: wait for the saved session to be checked, then a signed-in user
 * goes to Home (or to Verify email if the email isn't confirmed yet) and
 * everyone else starts at Welcome.
 */
export default function Index() {
  const { status, user } = useAuth();
  if (status === 'restoring') return <Splash />;
  if (status === 'signedOut' || !user) return <Redirect href="/welcome" />;
  return <Redirect href={user.emailVerified ? '/home' : '/verify-email'} />;
}
