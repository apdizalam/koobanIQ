export const PERIODS = ['day', 'week', 'month', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export const isPeriod = (value: unknown): value is Period =>
  typeof value === 'string' && (PERIODS as readonly string[]).includes(value);

/** GET /api/v1/admin/overview answer (backend services/overviewService.ts). */
export interface Overview {
  period: Period;
  since: string;
  generatedAt: string;
  users: { total: number; admins: number; suspended: number; new: number; active: number };
  languages: { en: number; so: number };
}
