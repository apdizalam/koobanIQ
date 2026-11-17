import type { AuthState } from '../auth/authContext';
import type { AuditAction, AuditEntry, AuditPage } from '../types/audit';

export const AUDIT_PAGE_SIZE = 25;

export const fetchAuditLogs = (
  request: AuthState['request'],
  filters: { action: '' | AuditAction; page: number },
) => {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  params.set('page', String(filters.page));
  params.set('limit', String(AUDIT_PAGE_SIZE));
  return request<AuditPage>(`/admin/audit-logs?${params.toString()}`);
};

/** Translation key for an action label, e.g. "user.role_change" → "user_role_change". */
export const actionKey = (action: string) => action.replace(/\./g, '_');

/**
 * What changed, as plain pieces the page can translate, e.g.
 * [{ field: 'status', from: 'active', to: 'suspended' }]. Deletes and denied
 * attempts have no before→after pair.
 */
export function describeChange(entry: AuditEntry): { field: string; from: string; to: string }[] {
  if (!entry.before || !entry.after) return [];
  return Object.keys(entry.after)
    .filter((field) => entry.before![field] !== entry.after![field])
    .map((field) => ({
      field,
      from: String(entry.before![field] ?? ''),
      to: String(entry.after![field] ?? ''),
    }));
}
