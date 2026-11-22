import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../auth/authContext';
import { QuizOption, type OptionState } from '../../../components/quiz/QuizOption';
import { QuizReport } from '../../../components/quiz/QuizReport';
import { BackButton, goBackOrHome } from '../../../components/ui/BackButton';
import { Button } from '../../../components/ui/Button';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Icon } from '../../../components/ui/Icon';
import { aiErrorText } from '../../../cv/aiErrorText';
import { useSkills } from '../../../profile/SkillsProvider';
import { ApiError } from '../../../services/api';
import { answerQuiz, cancelQuiz, fetchQuiz } from '../../../services/quizApi';
import type { Quiz, QuizFeedback, QuizQuestion } from '../../../types/quiz';
import { useTheme } from '../../../theme';

/**
 * One quiz (TIQ-14, design "08 · Assessment — Question"): progress, difficulty
 * and topic, the question with options A–D, the right answer and why after
 * checking, then the next question (chosen by the server, adapting to the
 * answers) and finally the report. Leaving keeps the answers (continue later)
 * or cancels the quiz; the skill only changes when a quiz is finished.
 */
export default function QuizScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { id, fromJob } = useLocalSearchParams<{ id: string; fromJob?: string }>();
  const { getAccessToken } = useAuth();
  const { reload: reloadSkills } = useSkills();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  /** The quiz after the answer: shown when the user taps Next. */
  const [pending, setPending] = useState<Quiz | null>(null);
  const [adapted, setAdapted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAccessToken()
      .then((token) => fetchQuiz(token, id))
      .then(
        (data) => active && setQuiz(data.assessment),
        () => active && setFailed(true),
      );
    return () => {
      active = false;
    };
  }, [id, getAccessToken]);

  const question: QuizQuestion | null = quiz?.question ?? null;

  async function check() {
    if (!quiz || !question || selected === null || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const data = await answerQuiz(await getAccessToken(), quiz.id, question.id, selected);
      setFeedback(data.feedback);
      setPending(data.assessment);
      if (data.assessment.status === 'finished') void reloadSkills();
    } catch (err) {
      setProblem(aiErrorText(err, t));
      // Answered elsewhere (another device): show where the quiz is now.
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await fetchQuiz(await getAccessToken(), quiz.id).catch(() => null);
        if (fresh) setQuiz(fresh.assessment);
        setSelected(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!pending || !question) return;
    setAdapted(!!pending.question && pending.question.difficulty !== question.difficulty);
    setQuiz(pending);
    setPending(null);
    setFeedback(null);
    setSelected(null);
  }

  async function cancelAndLeave() {
    if (!quiz) return;
    setBusy(true);
    try {
      await cancelQuiz(await getAccessToken(), quiz.id);
      goBackOrHome();
    } catch (err) {
      setProblem(aiErrorText(err, t));
      setBusy(false);
    }
  }

  const inProgress = quiz?.status === 'in_progress' && !!question;
  const stateOf = (index: number): OptionState => {
    if (feedback) {
      if (index === feedback.correctChoice) return 'right';
      if (index === selected) return 'wrong';
      return 'idle';
    }
    return index === selected ? 'selected' : 'idle';
  };
  const tag = (text: string, bg: string, fg: string, testID?: string) => (
    <Text
      testID={testID}
      style={[
        typography.labelMedium,
        {
          color: fg,
          backgroundColor: bg,
          borderRadius: radius.chip,
          overflow: 'hidden',
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
      ]}
    >
      {text}
    </Text>
  );
  const difficultyColors = {
    easy: { bg: colors.successSoft, fg: colors.successText },
    normal: { bg: colors.primarySoft, fg: colors.primary },
    hard: { bg: colors.warningSoft, fg: colors.warningText },
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <StatusBar style="auto" />
      <ScrollView
        testID="quiz-screen"
        contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg, flexGrow: 1 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <BackButton onPress={() => (inProgress ? setLeaving(true) : goBackOrHome())} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text
                numberOfLines={2}
                style={[typography.labelMedium, { color: colors.text, flex: 1 }]}
              >
                {quiz?.skillName ?? ''}
              </Text>
              {question ? (
                <Text
                  testID="quiz-progress"
                  style={[typography.labelMedium, { color: colors.textMuted }]}
                >
                  {question.number} / {question.total}
                </Text>
              ) : null}
            </View>
            {question ? (
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: question.total, now: question.number }}
                style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}
              >
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.round((question.number / question.total) * 100)}%`,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>

        {!quiz && !failed ? (
          <View style={{ paddingVertical: spacing.xxxl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        {!quiz && failed ? <FormMessage text={t('mobile.quiz.notFound')} /> : null}

        {leaving ? (
          <View testID="quiz-leave" style={{ gap: spacing.sm }}>
            <FormMessage tone="info" text={t('mobile.quiz.leave.text')} />
            <Button
              variant="secondary"
              label={t('mobile.quiz.leave.later')}
              onPress={goBackOrHome}
              testID="quiz-leave-later"
            />
            <Button
              variant="secondary"
              label={t('mobile.quiz.leave.cancel')}
              onPress={() => void cancelAndLeave()}
              loading={busy}
              testID="quiz-leave-cancel"
            />
            <Button
              variant="ghost"
              label={t('mobile.quiz.leave.stay')}
              onPress={() => setLeaving(false)}
              testID="quiz-leave-stay"
            />
          </View>
        ) : null}

        {inProgress && question ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              {tag(
                t(`mobile.quiz.difficulty.${question.difficulty}`),
                difficultyColors[question.difficulty].bg,
                difficultyColors[question.difficulty].fg,
                'quiz-difficulty',
              )}
              {tag(question.topic, colors.primarySoft, colors.text, 'quiz-topic')}
              {adapted ? (
                <View
                  testID="quiz-adapted"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}
                >
                  <Icon name="sparkle" size={14} color={colors.textMuted} />
                  <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                    {t('mobile.quiz.adapted')}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text testID="quiz-question" style={[typography.h2, { color: colors.text }]}>
              {question.question}
            </Text>

            <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
              {question.options.map((option, index) => (
                <QuizOption
                  key={`${question.id}-${index}`}
                  testID={`quiz-option-${index}`}
                  index={index}
                  label={option}
                  state={stateOf(index)}
                  stateLabel={
                    feedback && index === feedback.correctChoice
                      ? t('mobile.quiz.rightAnswer')
                      : undefined
                  }
                  onPress={feedback || busy ? undefined : () => setSelected(index)}
                />
              ))}
            </View>

            {feedback ? (
              <View
                testID="quiz-feedback"
                accessibilityLiveRegion="polite"
                style={{
                  backgroundColor: feedback.correct ? colors.successSoft : colors.errorSoft,
                  borderRadius: radius.card,
                  padding: spacing.card,
                  gap: spacing.xs,
                }}
              >
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: feedback.correct ? colors.successText : colors.errorText },
                  ]}
                >
                  {feedback.correct ? t('mobile.quiz.correct') : t('mobile.quiz.wrong')}
                </Text>
                <Text style={[typography.body, { color: colors.text }]}>
                  {feedback.explanation}
                </Text>
              </View>
            ) : null}

            <View style={{ flex: 1 }} />
            <FormMessage tone="info" text={t('mobile.quiz.disclaimer')} />
            {problem ? <FormMessage text={problem} /> : null}
            {feedback ? (
              <Button
                label={
                  pending?.status === 'finished'
                    ? t('mobile.quiz.seeResults')
                    : t('mobile.quiz.next')
                }
                onPress={next}
                testID="quiz-next"
              />
            ) : (
              <Button
                label={t('mobile.quiz.check')}
                onPress={() => void check()}
                disabled={selected === null}
                loading={busy}
                testID="quiz-check"
              />
            )}
          </>
        ) : null}

        {quiz?.status === 'finished' && quiz.result ? (
          <>
            <QuizReport quiz={quiz} />
            {fromJob ? (
              <Button
                label={t('mobile.quiz.report.backToJob')}
                onPress={goBackOrHome}
                testID="quiz-back-to-job"
              />
            ) : null}
            <Button
              variant={fromJob ? 'secondary' : 'primary'}
              label={t('mobile.quiz.report.toSkills')}
              onPress={() => router.replace('/skills')}
              testID="quiz-to-skills"
            />
            <Button
              variant="secondary"
              label={t('mobile.quiz.report.another')}
              onPress={() =>
                router.replace({ pathname: '/quiz', params: { skillId: quiz.skillId } })
              }
              testID="quiz-another"
            />
          </>
        ) : null}

        {quiz?.status === 'cancelled' ? (
          <>
            <FormMessage tone="info" text={t('mobile.quiz.cancelled')} />
            <Button
              label={t('mobile.quiz.report.another')}
              onPress={() =>
                router.replace({ pathname: '/quiz', params: { skillId: quiz.skillId } })
              }
              testID="quiz-another"
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
