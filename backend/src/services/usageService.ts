import { env } from '../config/env.js';
import { AI_FEATURES, UsageRecord, type AiFeature } from '../models/UsageRecord.js';
import { User } from '../models/User.js';
import type { Period } from './overviewService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30, year: 365 };
/** Most active users shown on the admin page. */
export const TOP_USERS = 50;

export interface UsageCounts {
  /** Every record: sent requests and the ones the hourly cap stopped. */
  requests: number;
  ok: number;
  /** Sent, but the answer could not be used (provider error, timeout, invalid answer). */
  failed: number;
  /** Stopped by the hourly safety cap, never sent. */
  capped: number;
  inputTokens: number;
  outputTokens: number;
}

const COUNTS = {
  requests: { $sum: 1 },
  ok: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
  capped: { $sum: { $cond: [{ $eq: ['$status', 'capped'] }, 1, 0] } },
  inputTokens: { $sum: '$inputTokens' },
  outputTokens: { $sum: '$outputTokens' },
};

type Row = Omit<UsageCounts, 'failed'> & { _id: unknown; lastAt?: Date };

const counts = (row?: Row): UsageCounts => ({
  requests: row?.requests ?? 0,
  ok: row?.ok ?? 0,
  failed: (row?.requests ?? 0) - (row?.ok ?? 0) - (row?.capped ?? 0),
  capped: row?.capped ?? 0,
  inputTokens: row?.inputTokens ?? 0,
  outputTokens: row?.outputTokens ?? 0,
});

/**
 * AI usage for the admin dashboard (TIQ-23), counted straight from
 * `usageRecords`: totals, per feature and the most active users. Monitoring
 * only: nothing here limits what a user may do.
 */
export async function getUsage(period: Period = 'week', now = new Date()) {
  const since = new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);
  const match = { $match: { createdAt: { $gte: since } } };

  const [totals, perFeature, perUser, users] = await Promise.all([
    UsageRecord.aggregate<Row>([match, { $group: { _id: null, ...COUNTS } }]),
    UsageRecord.aggregate<Row>([match, { $group: { _id: '$feature', ...COUNTS } }]),
    UsageRecord.aggregate<Row>([
      match,
      { $group: { _id: '$userId', ...COUNTS, lastAt: { $max: '$createdAt' } } },
      { $sort: { requests: -1, lastAt: -1 } },
      { $limit: TOP_USERS },
    ]),
    UsageRecord.distinct('userId', { createdAt: { $gte: since } }),
  ]);

  const emails = new Map(
    (await User.find({ _id: { $in: perUser.map((r) => r._id) } }, { email: 1 }).lean()).map((u) => [
      String(u._id),
      u.email,
    ]),
  );

  return {
    period,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    hourlyCap: env.aiUserRequestsPerHour,
    totals: { ...counts(totals[0]), users: users.length },
    // Every feature, also unused ones (0), in a fixed order.
    features: AI_FEATURES.map((feature: AiFeature) => ({
      feature,
      ...counts(perFeature.find((r) => r._id === feature)),
    })),
    users: perUser.map((r) => ({
      userId: String(r._id),
      email: emails.get(String(r._id)) ?? null,
      ...counts(r),
      lastAt: r.lastAt!.toISOString(),
    })),
  };
}
