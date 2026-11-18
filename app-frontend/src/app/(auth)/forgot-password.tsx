import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requestErrorKey, type RequestErrorKey } from '../../auth/errorKey';
import { AuthScreen } from '../../components/layout/AuthScreen';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Input } from '../../components/ui/Input';
import { forgotPassword } from '../../services/authApi';
import { check, emailSchema, type FieldErrors } from '../../utils/validation';

/** User Flow (doc 8): Log in → Forgot password → reset via email code. Step 1: the email. */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<{ email: string }>>({});
  const [failure, setFailure] = useState<RequestErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setFailure(null);
    const result = check(emailSchema, { email });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      // The server answers the same whether or not the account exists.
      await forgotPassword(result.data.email);
      router.push({ pathname: '/reset-password', params: { email: result.data.email } });
    } catch (err) {
      setFailure(requestErrorKey(err));
    }
    setBusy(false);
  }

  return (
    <AuthScreen title={t('mobile.auth.forgot.title')} subtitle={t('mobile.auth.forgot.subtitle')}>
      <Input
        testID="forgot-email"
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
        onSubmitEditing={() => void submit()}
        errorMessage={fieldErrors.email && t(`mobile.auth.errors.${fieldErrors.email}`)}
      />

      {failure ? <FormMessage text={t(`mobile.auth.errors.${failure}`)} /> : null}

      <Button
        label={busy ? t('mobile.auth.forgot.submitting') : t('mobile.auth.forgot.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="forgot-submit"
      />
    </AuthScreen>
  );
}
