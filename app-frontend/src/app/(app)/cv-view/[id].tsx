import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { CvPreview } from '../../../components/cv/CvPreview';
import { GenerateMessages } from '../../../components/cv/GenerateMessages';
import { MissingInfoList } from '../../../components/cv/MissingInfoList';
import { Button } from '../../../components/ui/Button';
import { FormMessage } from '../../../components/ui/FormMessage';
import { useCvs } from '../../../cv/CvProvider';
import { useGenerateCv } from '../../../cv/useGenerateCv';
import { jobName, otherLanguage } from '../../../services/cvApi';
import type { Cv } from '../../../types/cv';
import { useTheme } from '../../../theme';
import { formatDate } from '../../../utils/format';

/**
 * One CV (TIQ-9): what is missing from the profile, the CV itself, then
 * Generate again (after adding the missing items), Generate in the other
 * language (a new version) and Delete. Approve + PDF come with TIQ-10.
 */
export default function CvScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadCv, removeCv, jobById } = useCvs();
  const { run, busy, problem } = useGenerateCv();
  const [cv, setCv] = useState<Cv | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadCv(id).then(
      (data) => active && setCv(data),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [id, loadCv]);

  async function remove() {
    if (!cv) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await removeCv(cv.id);
      router.back();
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
    }
  }

  const subtitle = cv
    ? [
        jobName(jobById(cv.jobDescriptionId), t('mobile.cv.job.untitled')),
        t(`common.language.${cv.language}`),
        t('mobile.cv.version', { version: cv.version }),
        formatDate(cv.createdAt, i18n.language),
      ].join(' · ')
    : '';

  return (
    <AuthScreen title={t('mobile.cv.view.title')} subtitle={subtitle}>
      {!cv && !failed ? (
        <View style={{ paddingVertical: spacing.xxxl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {!cv && failed ? <FormMessage text={t('mobile.cv.view.notFound')} /> : null}

      {cv?.content ? (
        <>
          <MissingInfoList items={cv.missingInfo} />
          <CvPreview content={cv.content} />

          <GenerateMessages busy={busy !== null} problem={problem} />
          <View style={{ gap: spacing.sm }}>
            <Button
              label={
                busy === cv.language
                  ? t('mobile.cv.generate.writingShort')
                  : t('mobile.cv.view.again')
              }
              onPress={() => void run(cv.jobDescriptionId, cv.language)}
              loading={busy === cv.language}
              disabled={busy !== null}
              testID="cv-again"
            />
            <Button
              variant="secondary"
              label={
                busy === otherLanguage(cv.language)
                  ? t('mobile.cv.generate.writingShort')
                  : t('mobile.cv.view.otherLanguage', {
                      language: t(`common.language.${otherLanguage(cv.language)}`),
                    })
              }
              onPress={() => void run(cv.jobDescriptionId, otherLanguage(cv.language))}
              loading={busy === otherLanguage(cv.language)}
              disabled={busy !== null}
              testID="cv-other-language"
            />
          </View>

          {deleteFailed ? <FormMessage text={t('mobile.cv.view.deleteFailed')} /> : null}
          {confirming ? (
            <View style={{ gap: spacing.sm }}>
              <FormMessage tone="info" text={t('mobile.cv.view.deleteConfirm')} />
              <Button
                variant="secondary"
                label={t('mobile.profile.deleteYes')}
                onPress={() => void remove()}
                loading={deleting}
                testID="cv-delete-yes"
              />
              <Button
                variant="ghost"
                label={t('mobile.profile.cancel')}
                onPress={() => setConfirming(false)}
                disabled={deleting}
              />
            </View>
          ) : (
            <Button
              variant="ghost"
              label={t('mobile.cv.view.delete')}
              onPress={() => setConfirming(true)}
              disabled={busy !== null}
              testID="cv-delete"
            />
          )}
        </>
      ) : null}
    </AuthScreen>
  );
}
