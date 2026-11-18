import { Redirect } from 'expo-router';
import { useAuth } from '../auth/authContext';
import { Splash } from '../components/layout/Splash';

/**
 * App start: wait for the saved session to be checked, then a signed-in user
 * goes straight to Home and everyone else starts at Welcome.
 */
export default function Index() {
  const { status } = useAuth();
  if (status === 'restoring') return <Splash />;
  return <Redirect href={status === 'signedIn' ? '/home' : '/welcome'} />;
}
