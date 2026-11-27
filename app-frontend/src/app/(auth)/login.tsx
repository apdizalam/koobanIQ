import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../../auth/authContext';
import { requestErrorKey, type RequestErrorKey } from '../../auth/errorKey';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { AuthScreen } from '../../components/layout/AuthScreen';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Input } from '../../components/ui/Input';
import { TextLink } from '../../components/ui/TextLink';
import { useTheme } from '../../theme';
import { check, loginSchema, type FieldErrors } from '../../utils/validation';

type Notice =
  | { kind: 'error'; key: RequestErrorKey }
  | { kind: 'info'; key: 'mobile.auth.login.passwordChanged' };

/** Figma "03 · Log in": email, password, forgot password, Google, create an account. */
export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { colors, typography, spacing } = useTheme();
  // After "Reset password" the user arrives here with their email and a confirmation.
  const params = useLocalSearchParams<{ email?: string; reset?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<{ email: string; password: string }>>(
    {},
  );
  const [notice, setNotice] = useState<Notice | null>(
    params.reset === 'done' ? { kind: 'info', key: 'mobile.auth.login.passwordChanged' } : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setNotice(null);
    const result = check(loginSchema, { email, password });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await signIn(result.data.email, result.data.password);
      router.replace('/home');
    } catch (err) {
      setNotice({ kind: 'error', key: requestErrorKey(err) });
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title={t('mobile.auth.login.title')}
      subtitle={t('mobile.auth.login.subtitle')}
      footer={
        <>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.auth.login.newHere')}
          </Text>
          <TextLink
            label={t('mobile.auth.login.createAccount')}
            onPress={() => router.replace('/sign-up')}
            testID="login-create"
          />
        </>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <Input
          testID="login-email"
          label={t('mobile.auth.login.email')}
          icon="mail"
          placeholder={t('mobile.auth.login.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
          errorMessage={fieldErrors.email && t(`mobile.auth.errors.${fieldErrors.email}`)}
        />
        <Input
          testID="login-password"
          label={t('mobile.auth.login.password')}
          placeholder={t('mobile.inputs.auth.password')}
          icon="lock"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
          onSubmitEditing={() => void submit()}
          errorMessage={fieldErrors.password && t(`mobile.auth.errors.${fieldErrors.password}`)}
        />
        <TextLink
          label={t('mobile.auth.login.forgot')}
          align="flex-end"
          onPress={() =>
            router.push({ pathname: '/forgot-password', params: { email: email.trim() } })
          }
          testID="login-forgot"
        />
      </View>

      {notice ? (
        <FormMessage
          tone={notice.kind}
          text={notice.kind === 'error' ? t(`mobile.auth.errors.${notice.key}`) : t(notice.key)}
        />
      ) : null}

      <Button
        label={busy ? t('mobile.auth.login.submitting') : t('mobile.auth.login.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="login-submit"
      />

      <GoogleSignInButton testID="login-google" disabled={busy} />
    </AuthScreen>
  );
}
