import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { CvPreview } from '../../../components/cv/CvPreview';
import { GenerateMessages } from '../../../components/cv/GenerateMessages';
import { MissingInfoList } from '../../../components/cv/MissingInfoList';
import { goBackOrHome } from '../../../components/ui/BackButton';
import { Button } from '../../../components/ui/Button';
import { FormMessage } from '../../../components/ui/FormMessage';
import { useCvs } from '../../../cv/CvProvider';
import { aiErrorText } from '../../../cv/aiErrorText';
import { sharePdf } from '../../../cv/sharePdf';
import { useGenerateCv } from '../../../cv/useGenerateCv';
import { jobName, otherLanguage } from '../../../services/cvApi';
import type { Cv } from '../../../types/cv';
import { useTheme } from '../../../theme';
import { formatDate } from '../../../utils/format';

type Busy = 'approve' | 'download' | null;

/**
 * One CV (TIQ-9, TIQ-10): its status, Approve (draft) or Download PDF
 * (approved), Edit wording, what is missing from the profile, the CV itself,
 * Generate again / in the other language (new versions) and Delete.
 */
export default function CvScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadCv, removeCv, jobById, approve, downloadPdf } = useCvs();
  const { run, busy, problem } = useGenerateCv();
  const [cv, setCv] = useState<Cv | null>(null);
  const [failed, setFailed] = useState(false);
  const [acting, setActing] = useState<Busy>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Loaded every time the screen shows, so edits made on the edit screen appear.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadCv(id).then(
        (data) => active && setCv(data),
        () => active && setFailed(true),
      );
      return () => {
        active = false;
      };
    }, [id, loadCv]),
  );

  async function doApprove() {
    if (!cv || acting) return;
    setActing('approve');
    setActionProblem(null);
    setNotice(null);
    try {
      const approved = await approve(cv.id);
      setCv({ ...cv, ...approved, content: cv.content });
      setNotice(t('mobile.cv.view.approvedNotice'));
    } catch (err) {
      setActionProblem(aiErrorText(err, t));
    } finally {
      setActing(null);
    }
  }

  async function doDownload() {
    if (!cv || acting) return;
    setActing('download');
    setActionProblem(null);
    setNotice(null);
    try {
      const { bytes, fileName } = await downloadPdf(cv.id);
      setCv({ ...cv, status: 'exported' });
      if (!(await sharePdf(bytes, fileName))) setNotice(t('mobile.cv.view.noShare'));
    } catch (err) {
      setActionProblem(aiErrorText(err, t));
    } finally {
      setActing(null);
    }
  }

  async function remove() {
    if (!cv) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await removeCv(cv.id);
      goBackOrHome();
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

  const statusColors = {
    draft: { bg: colors.warningSoft, fg: colors.warningText },
    approved: { bg: colors.successSoft, fg: colors.successText },
    exported: { bg: colors.successSoft, fg: colors.successText },
  } as const;

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
          <View style={{ gap: spacing.sm }}>
            <Text
              testID="cv-status"
              style={[
                typography.labelMedium,
                {
                  alignSelf: 'flex-start',
                  color: statusColors[cv.status].fg,
                  backgroundColor: statusColors[cv.status].bg,
                  borderRadius: radius.chip,
                  overflow: 'hidden',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                },
              ]}
            >
              {t(`mobile.cv.status.${cv.status}`)}
            </Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {cv.status === 'draft'
                ? t('mobile.cv.view.approveHint')
                : t('mobile.cv.view.editHintApproved')}
            </Text>
            {cv.status === 'draft' ? (
              <Button
                label={
                  acting === 'approve' ? t('mobile.cv.view.approving') : t('mobile.cv.view.approve')
                }
                onPress={() => void doApprove()}
                loading={acting === 'approve'}
                disabled={acting !== null || busy !== null}
                testID="cv-approve"
              />
            ) : (
              <Button
                label={
                  acting === 'download'
                    ? t('mobile.cv.view.downloading')
                    : t('mobile.cv.view.download')
                }
                onPress={() => void doDownload()}
                loading={acting === 'download'}
                disabled={acting !== null || busy !== null}
                testID="cv-download"
              />
            )}
            <Button
              variant="secondary"
              label={t('mobile.cv.view.edit')}
              onPress={() => router.push({ pathname: '/cv-edit/[id]', params: { id: cv.id } })}
              disabled={acting !== null || busy !== null}
              testID="cv-edit"
            />
            {notice ? <FormMessage tone="info" text={notice} /> : null}
            {actionProblem ? <FormMessage text={actionProblem} /> : null}
          </View>

          <MissingInfoList items={cv.missingInfo} />
          <CvPreview content={cv.content} />

          <GenerateMessages busy={busy !== null} problem={problem} />
          <View style={{ gap: spacing.sm }}>
            <Button
              variant="secondary"
              label={
                busy === cv.language
                  ? t('mobile.cv.generate.writingShort')
                  : t('mobile.cv.view.again')
              }
              onPress={() => void run(cv.jobDescriptionId, cv.language)}
              loading={busy === cv.language}
              disabled={busy !== null || acting !== null}
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
              disabled={busy !== null || acting !== null}
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
              disabled={busy !== null || acting !== null}
              testID="cv-delete"
            />
          )}
        </>
      ) : null}
    </AuthScreen>
  );
}
