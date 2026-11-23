import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { readGoogleReturn } from '../../auth/googleBrowser';
import { useGoogleSignIn } from '../../auth/useGoogleSignIn';
import { Splash } from '../../components/layout/Splash';

/**
 * The return link of "Continue with Google" (kobaniq://auth/google?code=…).
 * Usually the sign-in browser hands the link straight back to the button; on
 * some Android phones the link opens the app instead and lands here.
 */
export default function GoogleReturnScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { finish } = useGoogleSignIn();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void finish(readGoogleReturn(params)).then((outcome) => {
      if (outcome.kind === 'message') router.replace('/login');
    });
  }, [finish, params]);

  return <Splash />;
}
