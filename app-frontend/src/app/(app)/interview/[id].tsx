import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { FeedbackCard } from '../../../components/interview/FeedbackCard';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { goBackOrHome } from '../../../components/ui/BackButton';
import { Button } from '../../../components/ui/Button';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Input } from '../../../components/ui/Input';
import { aiErrorText } from '../../../cv/aiErrorText';
import { ApiError } from '../../../services/api';
import {
  answerInterview,
  cancelInterview,
  deleteInterview,
  fetchInterview,
} from '../../../services/interviewApi';
import { useTheme } from '../../../theme';
import {
  MAX_ANSWER_LENGTH,
  type Interview,
  type InterviewFeedback,
} from '../../../types/interview';

/**
 * One interview practice (TIQ-19): the question, a typed answer, AI feedback,
 * then the next question; at the end the average score and the whole
 * transcript (questions, answers, feedback). Stop keeps the answers so far.
 */
export default function InterviewScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { getAccessToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [failed, setFailed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  /** The session after the answer: shown when the user taps Next. */
  const [pending, setPending] = useState<Interview | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAccessToken()
      .then((token) => fetchInterview(token, id))
      .then(
        (data) => active && setInterview(data.interview),
        () => active && setFailed(true),
      );
    return () => {
      active = false;
    };
  }, [id, getAccessToken]);

  async function send() {
    const question = interview?.question;
    if (!interview || !question || !answer.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const data = await answerInterview(await getAccessToken(), interview.id, question.id, answer);
      setFeedback(data.feedback);
      setPending(data.interview);
    } catch (err) {
      setProblem(aiErrorText(err, t));
      // Answered elsewhere: show where the session is now.
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await fetchInterview(await getAccessToken(), interview.id).catch(() => null);
        if (fresh) setInterview(fresh.interview);
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (pending) setInterview(pending);
    setPending(null);
    setFeedback(null);
    setAnswer('');
  }

  async function stop() {
    if (!interview) return;
    try {
      const data = await cancelInterview(await getAccessToken(), interview.id);
      setInterview(data.interview);
      goBackOrHome();
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  async function remove() {
    if (!interview) return;
    try {
      await deleteInterview(await getAccessToken(), interview.id);
      router.back();
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  if (!interview) {
    return (
      <AuthScreen showBack onBack={goBackOrHome} title={t('mobile.interview.title')} subtitle="">
        {failed ? (
          <FormMessage text={t('mobile.interview.loadError')} />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </AuthScreen>
    );
  }

  const question = interview.question;
  const subtitle = `${t(`mobile.interview.types.${interview.type}`)} · ${interview.role}`;

  // ------------------------------------------------------------ answering
  if (question && interview.status === 'in_progress') {
    return (
      <AuthScreen
        showBack
        onBack={goBackOrHome}
        title={t('mobile.interview.questionOf', { number: question.number, total: question.total })}
        subtitle={subtitle}
      >
        <View style={{ gap: spacing.xs }}>
          <Text testID="interview-question" style={[typography.h2, { color: colors.text }]}>
            {question.question}
          </Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.interview.focus', { focus: question.focus })}
          </Text>
        </View>

        {feedback ? (
          <>
            <FeedbackCard testID="interview-feedback" feedback={feedback} />
            <Button
              testID="interview-next"
              label={t(
                pending?.status === 'finished'
                  ? 'mobile.interview.seeSummary'
                  : 'mobile.interview.next',
              )}
              onPress={next}
            />
          </>
        ) : (
          <>
            <Input
              testID="interview-answer"
              label={t('mobile.interview.yourAnswer')}
              placeholder={t('mobile.inputs.interview.answer')}
              hint={t('mobile.interview.answerHint', {
                count: answer.length,
                max: MAX_ANSWER_LENGTH,
              })}
              value={answer}
              onChangeText={setAnswer}
              multiline
              maxLength={MAX_ANSWER_LENGTH}
            />
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {t('mobile.interview.privacyShort')}
            </Text>
            {problem ? <FormMessage text={problem} /> : null}
            <Button
              testID="interview-send"
              label={t(busy ? 'mobile.interview.checking' : 'mobile.interview.send')}
              loading={busy}
              disabled={!answer.trim()}
              onPress={() => void send()}
            />
            <Button
              variant="ghost"
              testID="interview-stop"
              label={t('mobile.interview.stop')}
              onPress={() => void stop()}
            />
          </>
        )}
      </AuthScreen>
    );
  }

  // ------------------------------------------------------------ summary + transcript
  const transcript = interview.transcript ?? [];
  return (
    <AuthScreen
      showBack
      onBack={goBackOrHome}
      title={t(
        interview.status === 'finished'
          ? 'mobile.interview.summaryTitle'
          : 'mobile.interview.stoppedTitle',
      )}
      subtitle={subtitle}
    >
      {interview.summary ? (
        <View testID="interview-summary" style={{ gap: spacing.xs }}>
          <Text style={[typography.display, { color: colors.text }]}>
            {t('mobile.interview.average', { score: interview.summary.averageScore })}
          </Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.interview.averageNote')}
          </Text>
        </View>
      ) : null}
      {problem ? <FormMessage text={problem} /> : null}

      <View testID="interview-transcript" style={{ gap: spacing.lg }}>
        {transcript.length === 0 ? (
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.interview.noAnswers')}
          </Text>
        ) : (
          transcript.map((entry) => (
            <View key={entry.questionId} style={{ gap: spacing.sm }}>
              <Text style={[typography.h3, { color: colors.text }]}>
                {`${entry.number}. ${entry.question}`}
              </Text>
              <Text style={[typography.labelMedium, { color: colors.textMuted }]}>
                {t('mobile.interview.yourAnswer')}
              </Text>
              <Text style={[typography.body, { color: colors.text }]}>{entry.answer}</Text>
              <FeedbackCard
                testID={`interview-entry-${entry.questionId}`}
                feedback={entry.feedback}
              />
            </View>
          ))
        )}
      </View>

      <Button
        testID="interview-again"
        label={t('mobile.interview.again')}
        onPress={() => router.replace('/interview')}
      />
      <Button
        variant="ghost"
        testID="interview-delete"
        label={t('mobile.interview.delete')}
        onPress={() => void remove()}
      />
    </AuthScreen>
  );
}
