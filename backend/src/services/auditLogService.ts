import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';

/** Every action the API writes to auditLogs today (used for the admin filter). */
export const AUDIT_ACTIONS = [
  'admin.access_denied',
  'user.suspend',
  'user.reactivate',
  'user.role_change',
  'user.delete',
  'job_source.enable',
  'job_source.disable',
  'job_source.update',
  'region.update',
  'settings.ai_personal_data',
  'user.test_account',
  'research_run.retry',
  'research_schedule.pause',
  'research_schedule.resume',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);

export interface ListAuditQuery {
  action?: AuditAction;
  page: number;
  limit: number;
}

type Snapshot = Record<string, unknown> | null | undefined;

/**
 * Audit log for the admin page, newest first. Each record says who did it
 * (email), what, to which target (email for users, even deleted ones) and the
 * values before and after.
 */
export async function listAuditLogs({ action, page, limit }: ListAuditQuery) {
  const filter = action ? { action } : {};
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  // Look up every email we need in one query.
  const userIds = new Set<string>();
  for (const log of logs) {
    userIds.add(String(log.actorId));
    if (log.targetType === 'user' && log.targetId) userIds.add(log.targetId);
  }
  const users = await User.find({ _id: { $in: [...userIds] } }, { email: 1 }).lean();
  const emailOf = new Map(users.map((u) => [String(u._id), u.email]));

  // Deleted users are no longer in `users`; their delete record keeps the email,
  // so older rows about them (e.g. an earlier suspend) still show who it was.
  const missing = [...userIds].filter((id) => !emailOf.has(id));
  if (missing.length > 0) {
    const deletes = await AuditLog.find(
      { action: 'user.delete', targetId: { $in: missing } },
      { targetId: 1, before: 1 },
    ).lean();
    for (const record of deletes) {
      const email = (record.before as Snapshot)?.email;
      if (record.targetId && typeof email === 'string') emailOf.set(record.targetId, email);
    }
  }

  const items = logs.map((log) => {
    const before = log.before as Snapshot;
    let target = log.targetId ?? null;
    if (log.targetType === 'user' && log.targetId) {
      target = emailOf.get(log.targetId) ?? log.targetId;
    }
    return {
      id: String(log._id),
      at: log.createdAt,
      actor: emailOf.get(String(log.actorId)) ?? String(log.actorId),
      action: log.action,
      targetType: log.targetType,
      target,
      before: before ?? null,
      after: (log.after as Snapshot) ?? null,
      reason: log.reason ?? null,
      ip: log.ip ?? null,
    };
  });
  return { items, total, page, limit };
}
