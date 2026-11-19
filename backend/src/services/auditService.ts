import type { Request } from 'express';
import { AuditLog } from '../models/AuditLog.js';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Saves an audit record for the signed-in user of this request. A failure to
 * write the log is reported but never breaks the request itself.
 */
export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  if (!req.user) return;
  try {
    await AuditLog.create({
      ...entry,
      actorId: req.user._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  } catch (err) {
    console.error('Audit log write failed:', err instanceof Error ? err.message : err);
  }
}
