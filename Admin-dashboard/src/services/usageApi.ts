import type { AuthState } from '../auth/authContext';
import type { Period } from '../types/overview';
import type { Usage, UsageCounts } from '../types/usage';

/** AI usage for a period (TIQ-23; monitoring only). */
export const fetchUsage = (request: AuthState['request'], period: Period) =>
  request<Usage>(`/admin/usage?period=${period}`);

export const totalTokens = (c: Pick<UsageCounts, 'inputTokens' | 'outputTokens'>) =>
  c.inputTokens + c.outputTokens;

/** Short numbers for big token counts, e.g. 1,234,567 → "1.2M" (in the admin's language). */
export const formatCompact = (n: number, language: string) =>
  new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
