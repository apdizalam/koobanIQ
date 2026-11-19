import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Input } from '../../../components/ui/Input';
import { useCvs } from '../../../cv/CvProvider';
import { aiErrorText } from '../../../cv/aiErrorText';
import { JD_PDF_MAX_BYTES, JD_TEXT_MAX, jobTextProblem } from '../../../services/cvApi';
import { useTheme } from '../../../theme';

type Mode = 'paste' | 'pdf';
type Pdf = { name: string; uri: string; size: number };

/**
 * New CV, step 1 (TIQ-8): paste a job ad or pick a PDF; the AI reads it on the
 * server. Then the job's details and the CV language step open.
 */
export default function AddJobScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { addJob } = useCvs();
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickPdf() {
    setProblem(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const size = asset.size ?? new File(asset.uri).size;
    if (size > JD_PDF_MAX_BYTES) {
      setPdf(null);
      setProblem(t('mobile.cv.job.pdfTooLarge'));
      return;
    }
    setPdf({ name: asset.name, uri: asset.uri, size });
  }

  async function submit() {
    if (busy) return;
    setProblem(null);
    if (mode === 'paste') {
      const bad = jobTextProblem(text);
      if (bad) return setProblem(t(`mobile.cv.job.${bad}`));
    } else if (!pdf) {
      return setProblem(t('mobile.cv.job.pdfMissing'));
    }
    setBusy(true);
    try {
      const input =
        mode === 'paste'
          ? { text: text.trim() }
          : { pdf: { data: await new File(pdf!.uri).base64(), fileName: pdf!.name } };
      const job = await addJob(input);
      router.replace({ pathname: '/cv-job/[id]', params: { id: job.id } });
    } catch (err) {
      setProblem(aiErrorText(err, t));
      setBusy(false);
    }
  }

  return (
    <AuthScreen title={t('mobile.cv.job.title')} subtitle={t('mobile.cv.job.subtitle')}>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(['paste', 'pdf'] as const).map((m) => (
          <Chip
            key={m}
            testID={`cv-job-mode-${m}`}
            label={t(`mobile.cv.job.mode.${m}`)}
            selected={mode === m}
            onPress={() => {
              setMode(m);
              setProblem(null);
            }}
          />
        ))}
      </View>

      {mode === 'paste' ? (
        <View style={{ gap: spacing.xs }}>
          <Input
            testID="cv-job-text"
            label={t('mobile.cv.job.textLabel')}
            placeholder={t('mobile.cv.job.textPlaceholder')}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={JD_TEXT_MAX}
            editable={!busy}
            hint={t('mobile.cv.job.textHint', { count: text.trim().length, max: JD_TEXT_MAX })}
          />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button
            variant="secondary"
            label={pdf ? t('mobile.cv.job.pdfChange') : t('mobile.cv.job.pdfChoose')}
            onPress={() => void pickPdf()}
            disabled={busy}
            testID="cv-job-pick"
          />
          {pdf ? (
            <Text testID="cv-job-file" style={[typography.bodyStrong, { color: colors.text }]}>
              {pdf.name} · {Math.max(1, Math.round(pdf.size / 1024))} KB
            </Text>
          ) : null}
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.cv.job.pdfHint')}
          </Text>
        </View>
      )}

      {problem ? <FormMessage text={problem} /> : null}
      {busy ? <FormMessage tone="info" text={t('mobile.cv.job.reading')} /> : null}

      <Button
        label={busy ? t('mobile.cv.job.readingShort') : t('mobile.cv.job.submit')}
        onPress={() => void submit()}
        loading={busy}
        testID="cv-job-submit"
      />
      <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
        {t('mobile.cv.job.privacy')}
      </Text>
    </AuthScreen>
  );
}
