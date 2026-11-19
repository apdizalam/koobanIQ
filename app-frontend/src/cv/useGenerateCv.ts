import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../services/api';
import type { CvLanguage } from '../types/cv';
import { useCvs } from './CvProvider';
import { aiErrorText } from './aiErrorText';

export interface GenerateProblem {
  text: string;
  /** No CV email in the profile yet: offer a link to Personal info. */
  needsEmail: boolean;
}

/**
 * Generates a CV (a new version) and opens it. Shared by the job screen
 * (first CV) and the CV screen (again / in the other language).
 */
export function useGenerateCv() {
  const { t } = useTranslation();
  const { generate } = useCvs();
  const [busy, setBusy] = useState<CvLanguage | null>(null);
  const [problem, setProblem] = useState<GenerateProblem | null>(null);

  async function run(jobId: string, language: CvLanguage) {
    if (busy) return;
    setBusy(language);
    setProblem(null);
    try {
      const cv = await generate(jobId, language);
      setBusy(null);
      router.replace({ pathname: '/cv-view/[id]', params: { id: cv.id } });
    } catch (err) {
      setProblem({
        text: aiErrorText(err, t),
        needsEmail: err instanceof ApiError && err.code === 'CV_CONTACT_EMAIL_REQUIRED',
      });
      setBusy(null);
    }
  }

  return { run, busy, problem };
}
