import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { InterviewFeedback } from '../../types/interview';

/**
 * Feedback on one practice answer (TIQ-19): score out of 10 (about the
 * answer, not the person), summary, what worked, what to improve, and an
 * outline of a stronger answer.
 */
export function FeedbackCard({
  feedback,
  testID,
}: {
  feedback: InterviewFeedback;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const tone =
    feedback.score >= 7
      ? colors.successText
      : feedback.score >= 4
        ? colors.warningText
        : colors.errorText;
  const list = (title: string, items: string[]) =>
    items.length > 0 ? (
      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.labelMedium, { color: colors.text }]}>{title}</Text>
        {items.map((item) => (
          <Text key={item} style={[typography.body, { color: colors.text }]}>
            • {item}
          </Text>
        ))}
      </View>
    ) : null;

  return (
    <View
      testID={testID}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.md,
      }}
    >
      <Text
        testID={testID ? `${testID}-score` : undefined}
        style={[typography.h2, { color: tone }]}
      >
        {t('mobile.interview.feedback.score', { score: feedback.score })}
      </Text>
      <Text style={[typography.body, { color: colors.text }]}>{feedback.summary}</Text>
      {list(t('mobile.interview.feedback.strengths'), feedback.strengths)}
      {list(t('mobile.interview.feedback.improvements'), feedback.improvements)}
      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.labelMedium, { color: colors.text }]}>
          {t('mobile.interview.feedback.betterAnswer')}
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{feedback.betterAnswer}</Text>
      </View>
    </View>
  );
}
