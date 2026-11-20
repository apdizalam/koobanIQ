import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { Quiz } from '../../types/quiz';
import { useTheme } from '../../theme';
import { FormMessage } from '../ui/FormMessage';

/**
 * The quiz report (TIQ-14): score, the assessed level it sets on the skill,
 * strengths and gaps by topic, what to practise next, and the reminder that
 * it measures knowledge, not work experience.
 */
export function QuizReport({ quiz }: { quiz: Quiz }) {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const r = quiz.result!;
  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.card,
    gap: spacing.sm,
  };
  const list = (testID: string, title: string, items: string[], empty: string) => (
    <View testID={testID} style={card}>
      <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
        {title}
      </Text>
      {items.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>{empty}</Text>
      ) : (
        items.map((item) => (
          <Text key={item} style={[typography.body, { color: colors.text }]}>
            • {item}
          </Text>
        ))
      )}
    </View>
  );

  return (
    <View testID="quiz-report" style={{ gap: spacing.lg }}>
      <View style={[card, { alignItems: 'center', gap: spacing.xs }]}>
        <Text testID="quiz-score" style={[typography.display, { color: colors.text }]}>
          {r.scorePercent} %
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {t('mobile.quiz.report.correct', { correct: r.correct, total: r.total })}
        </Text>
        <Text testID="quiz-level" style={[typography.bodyStrong, { color: colors.primary }]}>
          {t('mobile.skills.assessedAs', { level: t(`mobile.skills.levels.${r.level}`) })}
        </Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted, textAlign: 'center' }]}>
          {t('mobile.quiz.report.levelNote', { skill: quiz.skillName })}
        </Text>
      </View>

      {list(
        'quiz-strengths',
        t('mobile.quiz.report.strengths'),
        r.strengths,
        t('mobile.quiz.report.noStrengths'),
      )}
      {list('quiz-gaps', t('mobile.quiz.report.gaps'), r.gaps, t('mobile.quiz.report.noGaps'))}
      {list(
        'quiz-recommendations',
        t('mobile.quiz.report.next'),
        r.gaps.length > 0
          ? r.gaps.map((topic) => t('mobile.quiz.report.practise', { topic }))
          : [t('mobile.quiz.report.harder')],
        '',
      )}

      <FormMessage tone="info" text={t('mobile.quiz.disclaimer')} />
    </View>
  );
}
