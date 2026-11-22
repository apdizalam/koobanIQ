import type { AuthState } from '../auth/authContext';
import type { RegionKey } from '../types/jobSources';

type Request = AuthState['request'];

/** Backend services/adminJobService.ts (TIQ-33). */
export const JOB_STATES = ['active', 'expired', 'removed'] as const;
export type JobState = (typeof JOB_STATES)[number];
export const isJobState = (v: unknown): v is JobState =>
  typeof v === 'string' && (JOB_STATES as readonly string[]).includes(v);

export const REMOVE_REASONS = ['invalid', 'expired', 'duplicate', 'other'] as const;
export type RemoveReason = (typeof REMOVE_REASONS)[number];

export type MatchCategory = 'strong' | 'good' | 'potential' | 'gap';
export type LevelFit = 'fits' | 'stretch' | 'above' | 'below' | 'unknown';

export const JOBS_PAGE_SIZE = 25;

export interface AdminJobRow {
  id: string;
  title: string;
  employer: string;
  region: RegionKey;
  city: string | null;
  sourceKeys: string[];
  applyUrl: string;
  deadline: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  state: JobState;
  removedReason: RemoveReason | null;
  matches: number;
  strongMatches: number;
  saved: number;
}

export interface JobPage {
  summary: {
    active: number;
    expired: number;
    removed: number;
    bySource: { sourceKey: string; active: number }[];
  };
  items: AdminJobRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminJobMatch {
  userId: string;
  email: string | null;
  score: number;
  category: MatchCategory;
  recommended: boolean;
  levelFit: LevelFit;
  userLevel: string | null;
  jobLevel: string | null;
  matchedSkills: string[];
  missingRequired: string[];
  computedAt: string;
}

export interface AdminJobDetail {
  id: string;
  title: string;
  employer: string;
  employerType: string;
  region: RegionKey;
  city: string | null;
  sourceKeys: string[];
  applyUrl: string;
  deadline: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  state: JobState;
  removedAt: string | null;
  removedReason: RemoveReason | null;
  removedBy: string | null;
  saved: number;
  matches: AdminJobMatch[];
}

export const fetchJobs = (
  request: Request,
  filters: { state: '' | JobState; source: string; q: string; page: number },
) => {
  const params = new URLSearchParams();
  if (filters.state) params.set('state', filters.state);
  if (filters.source) params.set('source', filters.source);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  params.set('page', String(filters.page));
  params.set('limit', String(JOBS_PAGE_SIZE));
  return request<JobPage>(`/admin/jobs?${params.toString()}`);
};

export const fetchJob = async (request: Request, id: string) =>
  (await request<{ job: AdminJobDetail }>(`/admin/jobs/${encodeURIComponent(id)}`)).job;

export const removeJob = async (request: Request, id: string, reason: RemoveReason) =>
  (
    await request<{ job: AdminJobDetail }>(`/admin/jobs/${encodeURIComponent(id)}/remove`, {
      method: 'POST',
      body: { reason },
    })
  ).job;

export const restoreJob = async (request: Request, id: string) =>
  (
    await request<{ job: AdminJobDetail }>(`/admin/jobs/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    })
  ).job;

export const removeExpiredJobs = async (request: Request) =>
  (await request<{ removed: number }>('/admin/jobs/remove-expired', { method: 'POST' })).removed;

/** "Hargeisa, Somaliland" style place, with the region translated by the caller. */
export const placeLabel = (city: string | null, regionName: string) =>
  city ? `${city}, ${regionName}` : regionName;
