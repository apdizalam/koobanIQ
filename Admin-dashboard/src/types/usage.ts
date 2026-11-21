import type { Period } from './overview';

/** The AI features, in the order the backend lists them (models/UsageRecord.ts). */
export const AI_FEATURES = [
  'jd_extraction',
  'cv_generation',
  'skill_quiz',
  'job_match',
  'interview',
  'connectivity_check',
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface UsageCounts {
  /** Every record: sent requests and the ones the hourly cap stopped. */
  requests: number;
  ok: number;
  /** Sent, but no usable answer. */
  failed: number;
  /** Stopped by the hourly safety cap, never sent. */
  capped: number;
  inputTokens: number;
  outputTokens: number;
}

/** GET /api/v1/admin/usage answer (backend services/usageService.ts, TIQ-23). */
export interface Usage {
  period: Period;
  since: string;
  generatedAt: string;
  /** AI requests per user per hour before the safety cap stops them. */
  hourlyCap: number;
  totals: UsageCounts & { users: number };
  features: (UsageCounts & { feature: AiFeature })[];
  users: (UsageCounts & { userId: string; email: string | null; lastAt: string })[];
}
