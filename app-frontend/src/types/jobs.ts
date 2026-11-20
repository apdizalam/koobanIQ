import type { MatchCategory } from './match';
import type { RegionKey } from './profile';

/** Why a listed job source can't be searched (backend jobs/sources/catalog.ts). */
export const SOURCE_REASONS = [
  'needs_approval',
  'no_free_api',
  'needs_permission',
  'terms_unverified',
  'not_relevant',
  'not_enabled',
] as const;
export type SourceReason = (typeof SOURCE_REASONS)[number];

/** A source the user can choose for a new search (GET /job-sources → sources). */
export interface JobSource {
  key: string;
  name: string;
  type: string;
  regions: RegionKey[];
  website: string | null;
  /** Credit the source asks for, shown with its jobs. */
  attribution: string | null;
  /** Searches the career-page links the user gives (custom URLs). */
  acceptsUrls: boolean;
  status: 'operational';
}

/** A listed source that can't be searched: shown with the reason, never selectable. */
export interface UnavailableJobSource {
  key: string;
  name: string;
  type: string;
  regions: RegionKey[];
  website: string | null;
  status: 'unavailable';
  reason: SourceReason;
}

export interface Job {
  id: string;
  sourceKey: string;
  applyUrl: string;
  sources: { sourceKey: string; applyUrl: string }[];
  title: string;
  employer: string;
  employerType: string;
  region: RegionKey;
  city: string | null;
  jobType: string | null;
  workMode: string | null;
  deadline: string | null;
  /** When the source says it was published (null when it doesn't say). */
  postedAt: string | null;
  language: string | null;
  description: string | null;
  /** When KOBANIQ first found it (not when it was published). */
  firstSeenAt: string;
  lastSeenAt: string;
}

export const CAREER_LEVELS = ['entry', 'junior', 'intermediate', 'senior', 'expert'] as const;
export type CareerLevel = (typeof CAREER_LEVELS)[number];
export type LevelFit = 'fits' | 'stretch' | 'above' | 'below' | 'unknown';

/** One reason for a score, as a text key + values (shown in the app language). */
export interface MatchReason {
  key: string;
  values?: Record<string, string | number | null>;
}

/** The user's match for a job (TIQ-17). The score is relevance, not a hiring chance. */
export interface JobMatchDetails {
  score: number;
  category: MatchCategory;
  recommended: boolean;
  matchedSkills: string[];
  missingRequired: string[];
  missingPreferred: string[];
  userLevel: CareerLevel | null;
  levelConfidence: 'confident' | 'estimated' | 'unknown';
  jobLevel: CareerLevel | null;
  levelFit: LevelFit;
  relevantYears: number | null;
  requiredYears: number | null;
  reasons: MatchReason[];
}

export interface MatchedJob {
  job: Job;
  match: JobMatchDetails;
}

/** GET /jobs/search (method A: jobs KOBANIQ already found). */
export interface StoredJobResults {
  regions: RegionKey[];
  searched: number;
  recommended: MatchedJob[];
  /** Only filled when asked for (lower=1). */
  lowerMatch: MatchedJob[];
  counts: { recommended: number; lowerMatch: number };
}

export type RunStatus = 'running' | 'completed' | 'partial' | 'failed';

export interface ResearchRun {
  id: string;
  status: RunStatus;
  sourceKeys: string[];
  regions: RegionKey[];
  customUrls: string[];
  perSource: {
    key: string;
    queried: boolean;
    found: number;
    invalid: number;
    new: number;
    duplicates: number;
    attempts: number;
    error: string | null;
    durationMs: number | null;
  }[];
  jobsFound: number;
  jobsNew: number;
  duplicates: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** GET /research/runs/:id (method B): the run and, once finished, its matched jobs. */
export interface RunResults {
  run: ResearchRun;
  recommended: MatchedJob[];
  lowerMatch: MatchedJob[];
}
