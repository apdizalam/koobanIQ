import type { EmployerType, RegionKey } from './jobSources';

/** Backend models/ResearchRun.ts and services/adminResearchService.ts (TIQ-33). */
export const RUN_STATUSES = ['running', 'completed', 'partial', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type RunTrigger = 'manual' | 'scheduled' | 'retry';

export const isRunStatus = (v: unknown): v is RunStatus =>
  typeof v === 'string' && (RUN_STATUSES as readonly string[]).includes(v);

/** Only a run that went wrong can be retried (the server checks the same). */
export const canRetry = (status: RunStatus) => status === 'failed' || status === 'partial';

/** One row of GET /admin/research-runs. */
export interface AdminRunRow {
  id: string;
  userId: string;
  email: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  sourceKeys: string[];
  jobsFound: number;
  jobsNew: number;
  failedSources: string[];
  error: string | null;
  retryOf: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface RunPage {
  items: AdminRunRow[];
  total: number;
  page: number;
  limit: number;
}

export interface PerSource {
  key: string;
  queried: boolean;
  found: number;
  invalid: number;
  new: number;
  duplicates: number;
  attempts: number;
  error: string | null;
  durationMs: number | null;
}

/** GET /admin/research-runs/:id */
export interface AdminRunDetail {
  id: string;
  userId: string;
  email: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  sourceKeys: string[];
  regions: RegionKey[];
  filters: { titles: string[]; skills: string[]; city?: string; employerTypes: EmployerType[] };
  customUrls: string[];
  perSource: PerSource[];
  jobsFound: number;
  jobsNew: number;
  duplicates: number;
  error: string | null;
  scheduleId: string | null;
  retryOf: string | null;
  startedAt: string;
  finishedAt: string | null;
  retries: { id: string; status: RunStatus; startedAt: string }[];
}

export type Frequency = 'hourly' | 'every6h' | 'daily' | 'weekly';

/** One row of GET /admin/research-schedules. */
export interface AdminSchedule {
  id: string;
  userId: string;
  email: string | null;
  frequency: Frequency;
  /** Local "HH:MM" in `timeZone`. */
  time: string;
  /** weekly: 0 = Monday … 6 = Sunday. */
  weekday: number | null;
  timeZone: string;
  sourceKeys: string[];
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastSkip: 'no_sources' | 'busy' | 'error' | null;
  runCount: number;
}

export interface SchedulePage {
  items: AdminSchedule[];
  total: number;
  page: number;
  limit: number;
}
