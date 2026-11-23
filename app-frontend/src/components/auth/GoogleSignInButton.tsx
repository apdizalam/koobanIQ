import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useGoogleSignIn, type GoogleMessageKey } from '../../auth/useGoogleSignIn';
import { useTheme } from '../../theme';
import { Button } from '../ui/Button';
import { FormMessage } from '../ui/FormMessage';

interface GoogleSignInButtonProps {
  testID: string;
  /** The rest of the form is busy (e.g. logging in with a password). */
  disabled?: boolean;
}

/** "or" divider + "Continue with Google" (TIQ-39), with its own message box. */
export function GoogleSignInButton({ testID, disabled }: GoogleSignInButtonProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { run } = useGoogleSignIn();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<GoogleMessageKey | null>(null);

  async function press() {
    if (busy) return;
    setMessage(null);
    setBusy(true);
    const outcome = await run();
    if (outcome.kind === 'message') {
      setMessage(outcome.key);
      setBusy(false);
    }
  }

  return (
    <>
      <View style={styles.orRow}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          {t('mobile.auth.login.or')}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      {message ? (
        <FormMessage
          tone={message === 'mobile.auth.google.cancelled' ? 'info' : 'error'}
          text={t(message)}
        />
      ) : null}
      <Button
        variant="secondary"
        label={busy ? t('mobile.auth.google.working') : t('mobile.auth.login.google')}
        onPress={() => void press()}
        loading={busy}
        disabled={disabled}
        testID={testID}
      />
    </>
  );
}

const styles = StyleSheet.create({
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
});
