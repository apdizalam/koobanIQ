/** Values from the backend (models/Region.ts, models/JobSource.ts; doc 9 §2 and §4). */
export const REGION_KEYS = ['somaliland', 'somalia', 'remote'] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export const EMPLOYER_TYPES = [
  'company',
  'ngo',
  'un_agency',
  'government',
  'education',
  'health',
  'other',
] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

export type SourceType = 'job_board' | 'ngo_un' | 'employer' | 'government' | 'partner';
export type SourceConnection = 'api' | 'feed' | 'manual_import';

/** One row of GET /api/v1/admin/job-sources. */
export interface AdminJobSource {
  key: string;
  name: string;
  type: SourceType;
  regions: RegionKey[];
  employerTypes: EmployerType[];
  languages: string[];
  logoUrl: string | null;
  website: string | null;
  connection: SourceConnection;
  enabled: boolean;
  priority: number;
  termsUrl: string | null;
  termsCheckedAt: string | null;
  rateLimitPerMinute: number | null;
  lastSuccessAt: string | null;
  /** 0–1, follows recent research runs. */
  errorRate: number;
  updatedAt: string;
  /** False when the server has no adapter for this source (it can't be enabled). */
  hasAdapter: boolean;
  /** Shown in the app even when it can't be searched (with the reason). */
  listed?: boolean;
  /** Why it can't be searched (null when nothing stops it). */
  unavailableReason?: SourceReason | null;
}

/** Why a listed source can't be searched (backend jobs/sources/catalog.ts). */
export const SOURCE_REASONS = [
  'needs_approval',
  'no_free_api',
  'needs_permission',
  'terms_unverified',
  'not_relevant',
  'not_enabled',
] as const;
export type SourceReason = (typeof SOURCE_REASONS)[number];

/** What an admin may change on a source (PATCH /admin/job-sources/:key). */
export interface SourceChanges {
  enabled?: boolean;
  regions?: RegionKey[];
  employerTypes?: EmployerType[];
  priority?: number;
}

/** One row of GET /api/v1/regions. */
export interface Region {
  key: RegionKey;
  order: number;
  cities: string[];
}
