import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Input } from '../../../components/ui/Input';
import { ListRow } from '../../../components/ui/ListRow';
import { useCvs } from '../../../cv/CvProvider';
import { aiErrorText } from '../../../cv/aiErrorText';
import { isLanguage } from '../../../i18n/language';
import { fetchInterviews, startInterview } from '../../../services/interviewApi';
import { useTheme } from '../../../theme';
import {
  INTERVIEW_LENGTHS,
  INTERVIEW_TYPES,
  type Interview,
  type InterviewLength,
  type InterviewType,
} from '../../../types/interview';
import { formatDate } from '../../../utils/format';

/**
 * Interview practice, start (TIQ-19): the practice type, the job (a typed
 * title, a saved job ad, or the job opened from Jobs), language and length;
 * unfinished sessions to continue; past sessions with their average score.
 * Text only. Answers go to the AI for feedback, so the screen warns not to
 * type personal details (owner decision).
 */
export default function InterviewStartScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { getAccessToken } = useAuth();
  const { jobs: jobAds } = useCvs();
  // From a job in the Jobs tab: practise for that job.
  const params = useLocalSearchParams<{ jobId?: string; jobTitle?: string }>();
  const [type, setType] = useState<InterviewType>(params.jobId ? 'job_specific' : 'general');
  const [role, setRole] = useState('');
  const [adId, setAdId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'so'>(
    isLanguage(i18n.language) ? i18n.language : 'en',
  );
  const [length, setLength] = useState<InterviewLength>(5);
  const [history, setHistory] = useState<Interview[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAccessToken()
        .then(fetchInterviews)
        .then(
          (data) => active && setHistory(data.interviews),
          () => undefined,
        );
      return () => {
        active = false;
      };
    }, [getAccessToken]),
  );

  const jobSpecific = type === 'job_specific';
  const fromJob = jobSpecific && !!params.jobId;
  const ready = jobSpecific ? fromJob || !!adId : role.trim().length > 0;

  async function start() {
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { interview } = await startInterview(await getAccessToken(), {
        type,
        ...(jobSpecific
          ? fromJob
            ? { jobId: params.jobId }
            : { jobDescriptionId: adId! }
          : { role: role.trim() }),
        language,
        length,
      });
      setBusy(false);
      router.push({ pathname: '/interview/[id]', params: { id: interview.id } });
    } catch (err) {
      setProblem(aiErrorText(err, t));
      setBusy(false);
    }
  }

  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm };
  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
      {text}
    </Text>
  );
  const unfinished = history.filter((i) => i.status === 'in_progress');
  const finished = history.filter((i) => i.status === 'finished');

  return (
    <AuthScreen
      showBack
      title={t('mobile.interview.start.title')}
      subtitle={t('mobile.interview.start.subtitle')}
    >
      <View testID="interview-privacy">
        <FormMessage tone="info" text={t('mobile.interview.privacy')} />
      </View>

      {unfinished.map((i) => (
        <ListRow
          key={i.id}
          testID={`interview-continue-${i.id}`}
          title={t('mobile.interview.start.continue', { role: i.role })}
          detail={t('mobile.interview.start.progress', { answered: i.answered, total: i.length })}
          onPress={() => router.push({ pathname: '/interview/[id]', params: { id: i.id } })}
        />
      ))}

      <View style={{ gap: spacing.sm }}>
        {heading(t('mobile.interview.start.type'))}
        <View style={row}>
          {INTERVIEW_TYPES.map((it) => (
            <Chip
              key={it}
              testID={`interview-type-${it}`}
              label={t(`mobile.interview.types.${it}`)}
              selected={type === it}
              onPress={() => setType(it)}
            />
          ))}
        </View>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          {t(`mobile.interview.typeHints.${type}`)}
        </Text>
      </View>

      {jobSpecific ? (
        <View style={{ gap: spacing.sm }}>
          {heading(t('mobile.interview.start.job'))}
          {fromJob ? (
            <Text testID="interview-from-job" style={[typography.body, { color: colors.text }]}>
              {params.jobTitle ?? ''}
            </Text>
          ) : jobAds.length === 0 ? (
            <FormMessage tone="info" text={t('mobile.interview.start.noJobAds')} />
          ) : (
            <View style={row}>
              {jobAds.map((ad) => (
                <Chip
                  key={ad.id}
                  testID={`interview-ad-${ad.id}`}
                  label={ad.extracted.title ?? ad.fileName ?? t('mobile.interview.start.untitled')}
                  selected={adId === ad.id}
                  onPress={() => setAdId(ad.id)}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <Input
          testID="interview-role"
          label={t('mobile.interview.start.role')}
          hint={t('mobile.interview.start.roleHint')}
          value={role}
          onChangeText={setRole}
          maxLength={100}
        />
      )}

      <View style={{ gap: spacing.sm }}>
        {heading(t('mobile.interview.start.language'))}
        <View style={row}>
          {(['en', 'so'] as const).map((lang) => (
            <Chip
              key={lang}
              testID={`interview-language-${lang}`}
              label={t(`common.language.${lang}`)}
              selected={language === lang}
              onPress={() => setLanguage(lang)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        {heading(t('mobile.interview.start.length'))}
        <View style={row}>
          {INTERVIEW_LENGTHS.map((n) => (
            <Chip
              key={n}
              testID={`interview-length-${n}`}
              label={t('mobile.interview.start.questions', { count: n })}
              selected={length === n}
              onPress={() => setLength(n)}
            />
          ))}
        </View>
      </View>

      {problem ? <FormMessage text={problem} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Button
          testID="interview-start"
          label={t(busy ? 'mobile.interview.start.writing' : 'mobile.interview.start.button')}
          loading={busy}
          disabled={!ready}
          onPress={() => void start()}
        />
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          {t('mobile.interview.start.wait')}
        </Text>
      </View>

      {finished.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {heading(t('mobile.interview.start.history'))}
          {finished.map((i) => (
            <ListRow
              key={i.id}
              testID={`interview-past-${i.id}`}
              title={`${t(`mobile.interview.types.${i.type}`)} · ${i.role}`}
              detail={t('mobile.interview.start.pastDetail', {
                score: i.summary?.averageScore ?? 0,
                date: formatDate(i.finishedAt ?? i.createdAt, i18n.language),
              })}
              onPress={() => router.push({ pathname: '/interview/[id]', params: { id: i.id } })}
            />
          ))}
        </View>
      ) : null}
    </AuthScreen>
  );
}
