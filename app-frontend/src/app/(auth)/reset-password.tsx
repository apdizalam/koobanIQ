import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { requestErrorKey, type RequestErrorKey } from '../../auth/errorKey';
import { AuthScreen } from '../../components/layout/AuthScreen';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Input } from '../../components/ui/Input';
import { TextLink } from '../../components/ui/TextLink';
import { useCooldown } from '../../hooks/useCooldown';
import { forgotPassword, resetPassword } from '../../services/authApi';
import { useTheme } from '../../theme';
import { check, resetSchema, type FieldErrors } from '../../utils/validation';

/** The server sends at most one code a minute. */
const RESEND_SECONDS = 60;

type Notice = { kind: 'error'; key: RequestErrorKey } | { kind: 'info'; key: 'codeSent' };

/** Step 2 of "Forgot password": the emailed code and a new password. */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<{ code: string; password: string }>>(
    {},
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  // A code was just sent from the previous screen.
  const cooldown = useCooldown(RESEND_SECONDS, { startNow: true });

  if (!email) return <Redirect href="/forgot-password" />;
  const address = email;

  async function submit() {
    if (busy) return;
    setNotice(null);
    const result = check(resetSchema, { code, password });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await resetPassword(address, result.data.code, result.data.password);
      router.replace({ pathname: '/login', params: { email: address, reset: 'done' } });
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
      await forgotPassword(address);
      setNotice({ kind: 'info', key: 'codeSent' });
    } catch (err) {
      setNotice({ kind: 'error', key: requestErrorKey(err) });
    }
  }

  return (
    <AuthScreen
      title={t('mobile.auth.reset.title')}
      subtitle={t('mobile.auth.reset.subtitle', { email: address })}
    >
      <View style={{ gap: spacing.lg }}>
        <Input
          testID="reset-code"
          label={t('mobile.auth.verify.code')}
          placeholder="123456"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          editable={!busy}
          errorMessage={fieldErrors.code && t(`mobile.auth.errors.${fieldErrors.code}`)}
        />
        <View style={{ gap: spacing.xs }}>
          <Input
            testID="reset-password"
            label={t('mobile.auth.reset.newPassword')}
            icon="lock"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!busy}
            onSubmitEditing={() => void submit()}
            errorMessage={fieldErrors.password && t(`mobile.auth.errors.${fieldErrors.password}`)}
          />
          {fieldErrors.password ? null : (
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {t('mobile.auth.signUp.passwordHint')}
            </Text>
          )}
        </View>
      </View>

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
        label={busy ? t('mobile.auth.reset.submitting') : t('mobile.auth.reset.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="reset-submit"
      />

      <View style={{ alignItems: 'center' }}>
        {cooldown.left > 0 ? (
          <Text testID="reset-wait" style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.auth.verify.resendIn', { seconds: cooldown.left })}
          </Text>
        ) : (
          <TextLink
            label={t('mobile.auth.verify.resend')}
            onPress={() => void resend()}
            testID="reset-resend"
          />
        )}
      </View>
    </AuthScreen>
  );
}
