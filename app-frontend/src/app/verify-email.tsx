import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../auth/authContext';
import { requestErrorKey, type RequestErrorKey } from '../auth/errorKey';
import { AuthScreen } from '../components/layout/AuthScreen';
import { Splash } from '../components/layout/Splash';
import { Button } from '../components/ui/Button';
import { FormMessage } from '../components/ui/FormMessage';
import { Input } from '../components/ui/Input';
import { TextLink } from '../components/ui/TextLink';
import { useCooldown } from '../hooks/useCooldown';
import { useTheme } from '../theme';
import { check, codeSchema, type FieldErrors } from '../utils/validation';

/** The server sends at most one code a minute. */
const RESEND_SECONDS = 60;

type Notice = { kind: 'error'; key: RequestErrorKey } | { kind: 'info'; key: 'codeSent' };

/**
 * User Flow (doc 8): sign-up → verify email code → Home. For signed-in users
 * whose email isn't confirmed yet; the code was emailed in their language.
 */
export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { status, user, verifyEmail, resendVerification, signOut } = useAuth();
  const { colors, typography, spacing } = useTheme();
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<{ code: string }>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  // Straight after sign-up a code was just emailed, so "send a new code" waits a minute.
  const { sent } = useLocalSearchParams<{ sent?: string }>();
  const cooldown = useCooldown(RESEND_SECONDS, { startNow: sent === '1' });

  if (status === 'restoring') return <Splash />;
  if (status === 'signedOut' || !user) return <Redirect href="/welcome" />;
  if (user.emailVerified) return <Redirect href="/home" />;

  async function submit() {
    if (busy) return;
    setNotice(null);
    const result = check(codeSchema, { code });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await verifyEmail(result.data.code);
      router.replace('/home');
    } catch (err) {
      setNotice({ kind: 'error', key: requestErrorKey(err) });
      setCode('');
      setBusy(false);
    }
  }

  async function resend() {
    setNotice(null);
    cooldown.start();
    try {
      await resendVerification();
      setNotice({ kind: 'info', key: 'codeSent' });
    } catch (err) {
      setNotice({ kind: 'error', key: requestErrorKey(err) });
    }
  }

  async function logOut() {
    await signOut();
    router.replace('/welcome');
  }

  return (
    <AuthScreen
      showBack={false}
      title={t('mobile.auth.verify.title')}
      subtitle={t('mobile.auth.verify.subtitle', { email: user.email })}
      footer={
        <>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.auth.verify.wrongEmail')}
          </Text>
          <TextLink
            label={t('mobile.auth.verify.logOut')}
            onPress={() => void logOut()}
            testID="verify-logout"
          />
        </>
      }
    >
      <Input
        testID="verify-code"
        label={t('mobile.auth.verify.code')}
        placeholder="123456"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        editable={!busy}
        onSubmitEditing={() => void submit()}
        errorMessage={fieldErrors.code && t(`mobile.auth.errors.${fieldErrors.code}`)}
      />

      {notice ? (
        <FormMessage
          tone={notice.kind}
          text={
            notice.kind === 'error'
              ? t(`mobile.auth.errors.${notice.key}`)
              : t(`mobile.auth.verify.${notice.key}`)
          }
        />
      ) : null}

      <Button
        label={busy ? t('mobile.auth.verify.submitting') : t('mobile.auth.verify.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="verify-submit"
      />

      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        {cooldown.left > 0 ? (
          <Text testID="verify-wait" style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.auth.verify.resendIn', { seconds: cooldown.left })}
          </Text>
        ) : (
          <TextLink
            label={t('mobile.auth.verify.resend')}
            onPress={() => void resend()}
            testID="verify-resend"
          />
        )}
      </View>
    </AuthScreen>
  );
}
