import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../auth/authContext';
import { Splash } from '../../components/layout/Splash';
import { CvProvider } from '../../cv/CvProvider';
import { PushSetup } from '../../notifications/PushSetup';
import { ProfileProvider } from '../../profile/ProfileProvider';
import { SkillsProvider } from '../../profile/SkillsProvider';

/**
 * Screens for signed-in users (architecture doc: Expo Router "(app)" group). When
 * the server asks for it (mustVerifyEmail), the email is confirmed first (doc 8).
 */
export default function AppLayout() {
  const { status, user } = useAuth();
  if (status === 'restoring') return <Splash />;
  if (status === 'signedOut' || !user) return <Redirect href="/welcome" />;
  if (user.mustVerifyEmail) return <Redirect href="/verify-email" />;
  return (
    <ProfileProvider>
      <SkillsProvider>
        <CvProvider>
          <PushSetup />
          <Stack screenOptions={{ headerShown: false }} />
        </CvProvider>
      </SkillsProvider>
    </ProfileProvider>
  );
}
