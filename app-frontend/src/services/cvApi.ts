import { API_BASE_URL } from '../constants/api';
import i18n from '../i18n';
import type { Cv, CvEdit, CvLanguage, JobDescription } from '../types/cv';
import { AI_REQUEST_TIMEOUT_MS, ApiError, apiRequest } from './api';

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

/** Same limits as the backend (lib/validateCvEdit.ts). */
export const CV_EDIT_LIMITS = {
  headline: 120,
  summary: 800,
  bullet: 300,
  experienceBullets: 6,
  projectBullets: 4,
} as const;

/** PATCH /cvs/:id: a draft changes in place; an approved CV comes back as a new draft version. */
export const editCv = (accessToken: string, id: string, edit: CvEdit) =>
  apiRequest<{ cv: Cv }>(cv(id), { method: 'PATCH', accessToken, body: edit });

/** POST /cvs/:id/approve */
export const approveCv = (accessToken: string, id: string) =>
  apiRequest<{ cv: Cv }>(`${cv(id)}/approve`, { method: 'POST', accessToken });

/** Longest wait for the PDF (built on the server when asked). */
export const PDF_TIMEOUT_MS = 30_000;

/**
 * GET /cvs/:id/pdf: the PDF bytes and the server's file name. Only approved
 * CVs; the server explains a refusal (e.g. still a draft) in the app language.
 */
export async function downloadCvPdf(accessToken: string, id: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${cv(id)}/pdf`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Language': i18n.language },
      signal: controller.signal,
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { code: string; message: string };
      } | null;
      throw new ApiError(
        res.status,
        json?.error?.code ?? 'UNKNOWN_ERROR',
        json?.error?.message ?? 'Request failed',
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const disposition = res.headers.get('content-disposition') ?? '';
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `CV-${id}.pdf`;
    return { bytes, fileName };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The text box for bullet points (one per line) → the list to save, and what
 * the server would refuse (too many lines or a line too long).
 */
export function bulletLines(text: string, max: number) {
  const bullets = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
  const problem =
    bullets.length > max
      ? ('tooMany' as const)
      : bullets.some((b) => b.length > CV_EDIT_LIMITS.bullet)
        ? ('tooLong' as const)
        : null;
  return { bullets, problem };
}

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
