import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { GenerateMessages } from '../../../components/cv/GenerateMessages';
import { JobDetails } from '../../../components/cv/JobDetails';
import { QuizOffer } from '../../../components/cv/QuizOffer';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { useCvs } from '../../../cv/CvProvider';
import { useGenerateCv } from '../../../cv/useGenerateCv';
import { fetchJobDescription } from '../../../services/cvApi';
import { CV_LANGUAGES, type CvLanguage, type JobDescription } from '../../../types/cv';
import { useTheme } from '../../../theme';

/**
 * New CV, step 2: what the AI read from the job ad, an optional quiz on one of
 * its skills (TIQ-11, never required), then the CV language
 * (English or Somali, chosen every time; never copied from the app language)
 * and Create CV, which stays off until a language is chosen.
 */
export default function JobScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const { jobById } = useCvs();
  const known = jobById(id);
  const [loaded, setLoaded] = useState<JobDescription | null>(null);
  const [failed, setFailed] = useState(false);
  const [language, setLanguage] = useState<CvLanguage | null>(null);
  const { run, busy, problem } = useGenerateCv();
  const job = known ?? loaded;

  // Opened directly (not from the list): load it from the server.
  useEffect(() => {
    if (known) return;
    let active = true;
    getAccessToken()
      .then((token) => fetchJobDescription(token, id))
      .then(
        (data) => active && setLoaded(data.jobDescription),
        () => active && setFailed(true),
      );
    return () => {
      active = false;
    };
  }, [known, id, getAccessToken]);

  return (
    <AuthScreen title={t('mobile.cv.job.detailsTitle')} subtitle={t('mobile.cv.job.detailsHint')}>
      {job ? (
        <>
          <JobDetails job={job} />
          <QuizOffer job={job} />

          <View style={{ gap: spacing.sm }}>
            <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
              {t('mobile.cv.generate.languageTitle')}
            </Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {t('mobile.cv.generate.languageHint')}
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('mobile.cv.generate.languageTitle')}
              style={{ flexDirection: 'row', gap: spacing.sm }}
            >
              {CV_LANGUAGES.map((lang) => (
                <Chip
                  key={lang}
                  testID={`cv-language-${lang}`}
                  label={t(`common.language.${lang}`)}
                  selected={language === lang}
                  onPress={() => setLanguage(lang)}
                />
              ))}
            </View>
          </View>

          <GenerateMessages busy={busy !== null} problem={problem} />
          <Button
            label={busy ? t('mobile.cv.generate.writingShort') : t('mobile.cv.generate.create')}
            onPress={() => language && void run(job.id, language)}
            disabled={language === null}
            loading={busy !== null}
            testID="cv-generate"
          />
        </>
      ) : null}
      {!job && !failed ? (
        <View style={{ paddingVertical: spacing.xxxl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {!job && failed ? <FormMessage text={t('mobile.cv.job.notFound')} /> : null}
    </AuthScreen>
  );
}
