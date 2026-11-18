import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../../auth/authContext';
import { requestErrorKey, type RequestErrorKey } from '../../auth/errorKey';
import { AuthScreen } from '../../components/layout/AuthScreen';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Input } from '../../components/ui/Input';
import { TextLink } from '../../components/ui/TextLink';
import { DEFAULT_LANGUAGE, isLanguage } from '../../i18n/language';
import { useTheme } from '../../theme';
import { check, signUpSchema, type FieldErrors } from '../../utils/validation';

/** Create an account with email + password; the account gets the language chosen in onboarding. */
export default function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();
  const { colors, typography, spacing } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<{ email: string; password: string }>>(
    {},
  );
  const [failure, setFailure] = useState<RequestErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

  async function submit() {
    if (busy) return;
    setFailure(null);
    const result = check(signUpSchema, { email, password });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await signUp(result.data.email, result.data.password);
      // User Flow: sign-up → verify the emailed code → Home.
      router.replace({ pathname: '/verify-email', params: { sent: '1' } });
    } catch (err) {
      const key = requestErrorKey(err);
      // "Email already used" belongs to the email field; other failures go in the box.
      if (key === 'emailTaken') setFieldErrors({ email: 'emailTaken' });
      else setFailure(key);
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title={t('mobile.auth.signUp.title')}
      subtitle={t('mobile.auth.signUp.subtitle', {
        language: t(`common.language.${language}`),
      })}
      footer={
        <>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.auth.signUp.haveAccount')}
          </Text>
          <TextLink
            label={t('mobile.auth.signUp.logIn')}
            onPress={() => router.replace('/login')}
            testID="sign-up-login"
          />
        </>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <Input
          testID="sign-up-email"
          label={t('mobile.auth.signUp.email')}
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
        <View style={{ gap: spacing.xs }}>
          <Input
            testID="sign-up-password"
            label={t('mobile.auth.signUp.password')}
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

      {failure ? <FormMessage text={t(`mobile.auth.errors.${failure}`)} /> : null}

      <Button
        label={busy ? t('mobile.auth.signUp.submitting') : t('mobile.auth.signUp.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="sign-up-submit"
      />
    </AuthScreen>
  );
}
