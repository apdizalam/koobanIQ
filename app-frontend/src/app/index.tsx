import { Redirect } from 'expo-router';

/**
 * App start. For now every launch begins at Welcome; once sign-in exists
 * (TIQ-5 slice 3), a signed-in user goes straight to Home instead.
 */
export default function Index() {
  return <Redirect href="/welcome" />;
}
