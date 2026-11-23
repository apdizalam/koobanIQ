import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useAuth } from '../../auth/authContext';
import { useGoogleSignIn, type GoogleMessageKey } from '../../auth/useGoogleSignIn';
import { AuthScreen } from '../../components/layout/AuthScreen';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { FormMessage } from '../../components/ui/FormMessage';
import { TextLink } from '../../components/ui/TextLink';
import { useTheme } from '../../theme';

/**
 * "One more step" (TIQ-39): the Google account is new to KOBANIQ, so the user
 * confirms "I am 18 or older" before the account is created (same rule as
 * email sign-up). The one-time code from Google stays valid for a few minutes.
 */
export default function GoogleAgeScreen() {
  const { t } = useTranslation();
  const { signInWithGoogle } = useAuth();
  const { messageFor } = useGoogleSignIn();
  const { spacing } = useTheme();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [adult, setAdult] = useState(false);
  const [ageError, setAgeError] = useState(false);
  const [message, setMessage] = useState<GoogleMessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setMessage(null);
    if (!adult) {
      setAgeError(true);
      return;
    }
    if (!code) {
      setMessage('mobile.auth.google.failed');
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle(code, true);
      router.replace('/home');
    } catch (err) {
      setMessage(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title={t('mobile.auth.google.ageTitle')}
      subtitle={t('mobile.auth.google.ageBody')}
      footer={
        <TextLink
          label={t('mobile.auth.signUp.logIn')}
          onPress={() => router.replace('/login')}
          testID="google-age-login"
        />
      }
    >
      <View style={{ gap: spacing.lg }}>
        <Checkbox
          testID="google-age-check"
          label={t('mobile.auth.signUp.ageConfirm')}
          checked={adult}
          onChange={(value) => {
            setAdult(value);
            if (value) setAgeError(false);
          }}
          disabled={busy}
          errorMessage={ageError ? t('mobile.auth.errors.ageRequired') : undefined}
        />
      </View>
      {message ? <FormMessage text={t(message)} /> : null}
      <Button
        label={t('mobile.auth.google.ageContinue')}
        onPress={() => void submit()}
        loading={busy}
        testID="google-age-submit"
      />
    </AuthScreen>
  );
}
