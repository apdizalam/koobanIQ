/** Every action the backend writes to auditLogs (backend services/auditLogService.ts). */
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
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type Snapshot = Record<string, unknown> | null;

/** One row of GET /api/v1/admin/audit-logs. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  targetType: string;
  target: string | null;
  before: Snapshot;
  after: Snapshot;
  ip: string | null;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}
