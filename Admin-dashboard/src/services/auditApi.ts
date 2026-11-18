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

/** Bookkeeping fields that change on every save; not worth showing. */
const IGNORED_FIELDS = new Set(['updatedAt']);

/**
 * What changed, as raw pieces the page can translate, e.g.
 * [{ field: 'status', from: 'active', to: 'suspended' }]. Values keep their type
 * (lists stay lists, true/false stay booleans). Deletes and denied attempts have
 * no before→after pair.
 */
export function describeChange(entry: AuditEntry): { field: string; from: unknown; to: unknown }[] {
  const { before, after } = entry;
  if (!before || !after) return [];
  return Object.keys(after)
    .filter((field) => !IGNORED_FIELDS.has(field))
    .filter(
      (field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null),
    )
    .map((field) => ({ field, from: before[field] ?? null, to: after[field] ?? null }));
}
