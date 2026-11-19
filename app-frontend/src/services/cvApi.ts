import type { Cv, CvLanguage, JobDescription } from '../types/cv';
import { AI_REQUEST_TIMEOUT_MS, apiRequest } from './api';

/** Same limits as the backend (lib/validateJobDescription.ts). */
export const JD_TEXT_MIN = 50;
export const JD_TEXT_MAX = 20_000;
export const JD_PDF_MAX_BYTES = 5 * 1024 * 1024;

const jd = (id: string) => `/job-descriptions/${encodeURIComponent(id)}`;
const cv = (id: string) => `/cvs/${encodeURIComponent(id)}`;

/**
 * POST /job-descriptions: the AI reads a pasted ad or a PDF. The same ad sent
 * again comes back from the server without a new AI request.
 */
export const addJobDescription = (
  accessToken: string,
  input: { text: string } | { pdf: { data: string; fileName: string } },
) =>
  apiRequest<{ jobDescription: JobDescription }>('/job-descriptions', {
    method: 'POST',
    accessToken,
    body: input,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

export const fetchJobDescriptions = (accessToken: string) =>
  apiRequest<{ jobDescriptions: JobDescription[] }>('/job-descriptions', { accessToken });

export const fetchJobDescription = (accessToken: string, id: string) =>
  apiRequest<{ jobDescription: JobDescription }>(jd(id), { accessToken });

export const deleteJobDescription = (accessToken: string, id: string) =>
  apiRequest<void>(jd(id), { method: 'DELETE', accessToken });

/** POST /cvs/generate: a new CV version for this job ad in the language the user chose. */
export const generateCv = (accessToken: string, jobDescriptionId: string, language: CvLanguage) =>
  apiRequest<{ cv: Cv }>('/cvs/generate', {
    method: 'POST',
    accessToken,
    body: { jobDescriptionId, language },
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

/** GET /cvs: newest first, without the content. */
export const fetchCvs = (accessToken: string) => apiRequest<{ cvs: Cv[] }>('/cvs', { accessToken });

export const fetchCv = (accessToken: string, id: string) =>
  apiRequest<{ cv: Cv }>(cv(id), { accessToken });

export const deleteCv = (accessToken: string, id: string) =>
  apiRequest<void>(cv(id), { method: 'DELETE', accessToken });

/** Why a pasted ad would be refused (same rule as the server), or null when it is fine. */
export function jobTextProblem(text: string): 'tooShort' | 'tooLong' | null {
  const length = text.trim().length;
  if (length < JD_TEXT_MIN) return 'tooShort';
  if (length > JD_TEXT_MAX) return 'tooLong';
  return null;
}

/** The other CV language ("Generate in the other language"). */
export const otherLanguage = (language: CvLanguage): CvLanguage =>
  language === 'en' ? 'so' : 'en';

/** A job ad's display name: its title, or the company, or the file name. */
export const jobName = (job: JobDescription | undefined, fallback: string) =>
  job?.extracted.title ?? job?.extracted.company ?? job?.fileName ?? fallback;
