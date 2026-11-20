import type {
  JobSource,
  MatchedJob,
  ResearchRun,
  RunResults,
  StoredJobResults,
  UnavailableJobSource,
} from '../types/jobs';
import type { RegionKey } from '../types/profile';
import { apiRequest } from './api';

const job = (id: string) => `/jobs/${encodeURIComponent(id)}`;

export interface StoredSearch {
  q?: string;
  regions?: RegionKey[];
  city?: string;
  employerTypes?: string[];
  jobTypes?: string[];
  /** Also return the lower matches (only when the user asks). */
  lower?: boolean;
}

/** The query string for GET /jobs/search (empty values left out). */
export function storedSearchQuery(search: StoredSearch) {
  const parts: string[] = [];
  const add = (key: string, value: string) => {
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
  };
  add('q', search.q?.trim() ?? '');
  add('regions', (search.regions ?? []).join(','));
  add('city', search.city?.trim() ?? '');
  add('employerTypes', (search.employerTypes ?? []).join(','));
  add('jobTypes', (search.jobTypes ?? []).join(','));
  if (search.lower) parts.push('lower=1');
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Method A: search the jobs KOBANIQ already stored, scored for this user. */
export const searchStoredJobs = (accessToken: string, search: StoredSearch) =>
  apiRequest<StoredJobResults>(`/jobs/search${storedSearchQuery(search)}`, { accessToken });

/** The sources for the chosen regions: searchable ones, and listed ones with the reason they can't be. */
export const fetchJobSources = (accessToken: string, regions: RegionKey[]) =>
  apiRequest<{ sources: JobSource[]; unavailable: UnavailableJobSource[] }>(
    `/job-sources${regions.length ? `?regions=${regions.join(',')}` : ''}`,
    { accessToken },
  );

export interface ResearchInput {
  sourceKeys: string[];
  regions: RegionKey[];
  filters?: { titles?: string[]; city?: string; employerTypes?: string[] };
  customUrls?: string[];
}

/** Method B: starts a new search of the chosen sources (runs in the background). */
export const startResearch = (accessToken: string, input: ResearchInput) =>
  apiRequest<{ run: ResearchRun }>('/research/run', { method: 'POST', accessToken, body: input });

/** One search: progress while running, then the matched jobs. */
export const fetchRun = (accessToken: string, id: string) =>
  apiRequest<RunResults>(`/research/runs/${encodeURIComponent(id)}`, { accessToken });

/** One job with this user's match and whether it is saved. */
export const fetchJob = (accessToken: string, id: string) =>
  apiRequest<MatchedJob & { saved: boolean }>(job(id), { accessToken });

export const fetchSavedJobs = (accessToken: string) =>
  apiRequest<{ jobs: MatchedJob[] }>('/jobs/saved', { accessToken });

export const saveJob = (accessToken: string, id: string) =>
  apiRequest<void>(`${job(id)}/save`, { method: 'PUT', accessToken });

export const unsaveJob = (accessToken: string, id: string) =>
  apiRequest<void>(`${job(id)}/save`, { method: 'DELETE', accessToken });

/** Career-page links typed one per line (or separated by spaces / commas). */
export const parseLinks = (text: string) =>
  [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ] as string[];
