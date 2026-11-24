import type { AuthState } from '../auth/authContext';
import { isPeriod, type Period } from '../types/overview';

type Request = AuthState['request'];

/**
 * Backend services/adminInterviewService.ts: interview practice sessions,
 * read-only. Type, job, length and scores; never the user's answers or the AI
 * feedback on them.
 */
export const INTERVIEW_STATUSES = ['in_progress', 'finished', 'cancelled'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const INTERVIEW_TYPES = [
  'general',
  'technical',
  'behavioral',
  'job_specific',
  'problem_solving',
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export const INTERVIEW_LANGUAGES = ['en', 'so'] as const;
export type InterviewLanguage = (typeof INTERVIEW_LANGUAGES)[number];

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (list as readonly string[]).includes(v);
export const isInterviewStatus = oneOf(INTERVIEW_STATUSES);
export const isInterviewType = oneOf(INTERVIEW_TYPES);
export const isInterviewLanguage = oneOf(INTERVIEW_LANGUAGES);

export const INTERVIEWS_PAGE_SIZE = 25;

/** Badge colour per status (same as skill quizzes). */
export const INTERVIEW_STATUS_BADGE: Record<InterviewStatus, string> = {
  in_progress: 'badge-user',
  finished: 'badge-active',
  cancelled: 'badge-suspended',
};

export interface InterviewRow {
  id: string;
  userId: string;
  email: string | null;
  type: InterviewType;
  role: string;
  employer: string | null;
  language: InterviewLanguage;
  length: number;
  status: InterviewStatus;
  answered: number;
  /** Out of 10; null before the first answer. */
  averageScore: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface InterviewPage {
  summary: {
    finished: number;
    inProgress: number;
    cancelled: number;
    averageScore: number | null;
  };
  items: InterviewRow[];
  total: number;
  page: number;
  limit: number;
}

export interface InterviewQuestion {
  number: number;
  id: string;
  question: string;
  focus: string;
  score: number | null;
  answeredAt: string | null;
}

export interface InterviewDetail extends InterviewRow {
  jobDescriptionId: string | null;
  jobId: string | null;
  questions: InterviewQuestion[];
}

export interface InterviewFilters {
  status: '' | InterviewStatus;
  type: '' | InterviewType;
  language: '' | InterviewLanguage;
  period: '' | Period;
  page: number;
}

/** Filters from the address bar; anything unknown is ignored. */
export function filtersFromParams(params: URLSearchParams): InterviewFilters {
  const status = params.get('status');
  const type = params.get('type');
  const language = params.get('language');
  const period = params.get('period');
  return {
    status: isInterviewStatus(status) ? status : '',
    type: isInterviewType(type) ? type : '',
    language: isInterviewLanguage(language) ? language : '',
    period: isPeriod(period) ? period : '',
    page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
  };
}

/** The address bar for these filters (empty ones and page 1 are left out). */
export function filtersToParams(filters: InterviewFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.status) out.status = filters.status;
  if (filters.type) out.type = filters.type;
  if (filters.language) out.language = filters.language;
  if (filters.period) out.period = filters.period;
  if (filters.page > 1) out.page = String(filters.page);
  return out;
}

export const fetchInterviews = (request: Request, filters: InterviewFilters) => {
  const params = new URLSearchParams(filtersToParams({ ...filters, page: 1 }));
  params.set('page', String(filters.page));
  params.set('limit', String(INTERVIEWS_PAGE_SIZE));
  return request<InterviewPage>(`/admin/interviews?${params.toString()}`);
};

export const fetchInterview = async (request: Request, id: string) =>
  (await request<{ interview: InterviewDetail }>(`/admin/interviews/${encodeURIComponent(id)}`))
    .interview;

/** "Data Officer · Example Org", or just the job title when there is no employer. */
export const jobLabel = (row: Pick<InterviewRow, 'role' | 'employer'>) =>
  row.employer?.trim() ? `${row.role} · ${row.employer.trim()}` : row.role;
