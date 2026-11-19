import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { GenerateProblem } from '../../cv/useGenerateCv';
import { useTheme } from '../../theme';
import { Button } from '../ui/Button';
import { FormMessage } from '../ui/FormMessage';

/**
 * While a CV is written: a note that it takes a while. After a refusal: the
 * server's explanation, plus a way to add the CV email when that is missing.
 */
export function GenerateMessages({
  busy,
  problem,
}: {
  busy: boolean;
  problem: GenerateProblem | null;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  if (busy) return <FormMessage tone="info" text={t('mobile.cv.generate.writing')} />;
  if (!problem) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <FormMessage text={problem.text} />
      {problem.needsEmail ? (
        <Button
          variant="secondary"
          label={t('mobile.cv.generate.addEmail')}
          onPress={() => router.push('/profile-edit/personal')}
          testID="cv-add-email"
        />
      ) : null}
    </View>
  );
}
