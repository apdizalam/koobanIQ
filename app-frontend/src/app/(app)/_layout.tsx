import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';
import { Splash } from '../../components/layout/Splash';
import { CvProvider } from '../../cv/CvProvider';
import { ProfileProvider } from '../../profile/ProfileProvider';
import { SkillsProvider } from '../../profile/SkillsProvider';

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
      <SkillsProvider>
        <CvProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </CvProvider>
      </SkillsProvider>
    </ProfileProvider>
  );
}
