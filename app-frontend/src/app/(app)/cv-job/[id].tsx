import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { JobDetails } from '../../../components/cv/JobDetails';
import { FormMessage } from '../../../components/ui/FormMessage';
import { useCvs } from '../../../cv/CvProvider';
import { fetchJobDescription } from '../../../services/cvApi';
import type { JobDescription } from '../../../types/cv';
import { useTheme } from '../../../theme';

/** New CV, step 2: what the AI read from the job ad. */
export default function JobScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const { jobById } = useCvs();
  const known = jobById(id);
  const [loaded, setLoaded] = useState<JobDescription | null>(null);
  const [failed, setFailed] = useState(false);
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
      {job ? <JobDetails job={job} /> : null}
      {!job && !failed ? (
        <View style={{ paddingVertical: spacing.xxxl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {!job && failed ? <FormMessage text={t('mobile.cv.job.notFound')} /> : null}
    </AuthScreen>
  );
}
