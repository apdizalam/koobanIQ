import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';
import { Splash } from '../../components/layout/Splash';
import { ProfileProvider } from '../../profile/ProfileProvider';

/**
 * Screens for signed-in users with a confirmed email (architecture doc: Expo
 * Router "(app)" group). Unconfirmed accounts verify their email first (doc 8).
 */
export default function AppLayout() {
  const { status, user } = useAuth();
  if (status === 'restoring') return <Splash />;
  if (status === 'signedOut' || !user) return <Redirect href="/welcome" />;
  if (!user.emailVerified) return <Redirect href="/verify-email" />;
  return (
    <ProfileProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ProfileProvider>
  );
}
