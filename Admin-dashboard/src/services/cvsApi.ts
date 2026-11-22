import type { AuthState } from '../auth/authContext';

type Request = AuthState['request'];

/** Backend services/adminCvService.ts (TIQ-33): CV status only, never the CV text. */
export const CV_STATUSES = ['draft', 'approved', 'exported'] as const;
export type CvStatus = (typeof CV_STATUSES)[number];
export const isCvStatus = (v: unknown): v is CvStatus =>
  typeof v === 'string' && (CV_STATUSES as readonly string[]).includes(v);

export const CVS_PAGE_SIZE = 25;

export interface AdminCvRow {
  id: string;
  userId: string;
  email: string | null;
  jobTitle: string | null;
  company: string | null;
  language: 'en' | 'so';
  version: number;
  status: CvStatus;
  missingInfo: number;
  createdAt: string;
  approvedAt: string | null;
  exportedAt: string | null;
}

export interface CvPage {
  summary: Record<CvStatus, number>;
  items: AdminCvRow[];
  total: number;
  page: number;
  limit: number;
}

export const fetchCvs = (request: Request, filters: { status: '' | CvStatus; page: number }) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page));
  params.set('limit', String(CVS_PAGE_SIZE));
  return request<CvPage>(`/admin/cvs?${params.toString()}`);
};

/** "Data Officer · Example Org", or whichever part the job ad has (null: neither). */
export function jobLabel(cv: Pick<AdminCvRow, 'jobTitle' | 'company'>): string | null {
  const parts = [cv.jobTitle, cv.company].filter((p): p is string => !!p && p.trim() !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}
