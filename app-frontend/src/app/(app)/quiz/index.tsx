import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { ListRow } from '../../../components/ui/ListRow';
import { aiErrorText } from '../../../cv/aiErrorText';
import { isLanguage } from '../../../i18n/language';
import { useSkills } from '../../../profile/SkillsProvider';
import { cancelQuiz, fetchQuizzes, startQuiz } from '../../../services/quizApi';
import {
  QUIZ_DIFFICULTIES,
  QUIZ_LENGTHS,
  type Quiz,
  type QuizDifficulty,
  type QuizLength,
} from '../../../types/quiz';
import { useTheme } from '../../../theme';
import { formatDate } from '../../../utils/format';

/**
 * Skill quiz, start (TIQ-14): choose a skill, the difficulty to start at, the
 * quiz language and the length; continue or cancel an unfinished quiz; past
 * results. Quizzes are always optional and measure knowledge, not experience.
 */
export default function QuizStartScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { getAccessToken } = useAuth();
  const { skills, status } = useSkills();
  const params = useLocalSearchParams<{ skillId?: string }>();
  const [skillId, setSkillId] = useState<string | null>(params.skillId ?? null);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('normal');
  const [language, setLanguage] = useState<'en' | 'so'>(
    isLanguage(i18n.language) ? i18n.language : 'en',
  );
  const [length, setLength] = useState<QuizLength>(5);
  const [history, setHistory] = useState<Quiz[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Loaded each time the screen shows, so a finished or left quiz appears.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAccessToken()
        .then(fetchQuizzes)
        .then(
          (data) => active && setHistory(data.assessments),
          () => undefined,
        );
      return () => {
        active = false;
      };
    }, [getAccessToken]),
  );

  async function start() {
    if (!skillId || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { assessment } = await startQuiz(await getAccessToken(), {
        skillId,
        difficulty,
        language,
        length,
      });
      setBusy(false);
      router.push({ pathname: '/quiz/[id]', params: { id: assessment.id } });
    } catch (err) {
      setProblem(aiErrorText(err, t));
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await cancelQuiz(await getAccessToken(), id);
      setHistory((now) => now.map((q) => (q.id === id ? { ...q, status: 'cancelled' } : q)));
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  const unfinished = history.filter((q) => q.status === 'in_progress');
  const finished = history.filter((q) => q.status === 'finished');
  const label = (key: string) => (
    <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
      {t(key as 'mobile.quiz.start.skill')}
    </Text>
  );
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm };

  return (
    <AuthScreen title={t('mobile.quiz.start.title')} subtitle={t('mobile.quiz.start.subtitle')}>
      {unfinished.map((q) => (
        <View key={q.id} testID={`quiz-unfinished-${q.id}`} style={{ gap: spacing.sm }}>
          <FormMessage
            tone="info"
            text={t('mobile.quiz.start.unfinished', {
              skill: q.skillName,
              answered: q.answered,
              total: q.length,
            })}
          />
          <View style={row}>
            <Button
              variant="secondary"
              label={t('mobile.quiz.start.continue')}
              onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: q.id } })}
              testID={`quiz-continue-${q.id}`}
            />
            <Button
              variant="ghost"
              label={t('mobile.quiz.start.cancel')}
              onPress={() => void cancel(q.id)}
              testID={`quiz-cancel-${q.id}`}
            />
          </View>
        </View>
      ))}

      <View style={{ gap: spacing.sm }}>
        {label('mobile.quiz.start.skill')}
        {status === 'ready' && skills.length === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              {t('mobile.quiz.start.noSkills')}
            </Text>
            <Button
              variant="secondary"
              label={t('mobile.skills.addFirst')}
              onPress={() => router.push({ pathname: '/skills-edit/[id]', params: { id: 'new' } })}
              testID="quiz-add-skill"
            />
          </View>
        ) : (
          <View accessibilityRole="radiogroup" style={row}>
            {skills.map((s) => (
              <Chip
                key={s.id}
                testID={`quiz-skill-${s.id}`}
                label={s.name}
                selected={skillId === s.id}
                onPress={() => setSkillId(s.id)}
              />
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        {label('mobile.quiz.start.difficulty')}
        <View accessibilityRole="radiogroup" style={row}>
          {QUIZ_DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              testID={`quiz-difficulty-${d}`}
              label={t(`mobile.quiz.difficulty.${d}`)}
              selected={difficulty === d}
              onPress={() => setDifficulty(d)}
            />
          ))}
        </View>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          {t('mobile.quiz.start.adaptiveHint')}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        {label('mobile.quiz.start.language')}
        <View accessibilityRole="radiogroup" style={row}>
          {(['en', 'so'] as const).map((lang) => (
            <Chip
              key={lang}
              testID={`quiz-language-${lang}`}
              label={t(`common.language.${lang}`)}
              selected={language === lang}
              onPress={() => setLanguage(lang)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        {label('mobile.quiz.start.length')}
        <View accessibilityRole="radiogroup" style={row}>
          {QUIZ_LENGTHS.map((n) => (
            <Chip
              key={n}
              testID={`quiz-length-${n}`}
              label={t('mobile.quiz.start.questions', { count: n })}
              selected={length === n}
              onPress={() => setLength(n)}
            />
          ))}
        </View>
      </View>

      <FormMessage tone="info" text={t('mobile.quiz.disclaimer')} />
      {busy ? <FormMessage tone="info" text={t('mobile.quiz.start.writing')} /> : null}
      {problem ? <FormMessage text={problem} /> : null}
      <Button
        label={busy ? t('mobile.quiz.start.writingShort') : t('mobile.quiz.start.start')}
        onPress={() => void start()}
        disabled={!skillId}
        loading={busy}
        testID="quiz-start"
      />
      <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
        {t('mobile.quiz.start.privacy')}
      </Text>

      {finished.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {label('mobile.quiz.start.history')}
          {finished.map((q) => (
            <ListRow
              key={q.id}
              testID={`quiz-history-${q.id}`}
              title={q.skillName}
              detail={[
                `${q.result?.scorePercent ?? 0} %`,
                q.result ? t(`mobile.skills.levels.${q.result.level}`) : '',
                formatDate(q.finishedAt ?? q.createdAt, i18n.language),
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: q.id } })}
            />
          ))}
        </View>
      ) : null}
    </AuthScreen>
  );
}
