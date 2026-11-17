import type { AuthState } from '../auth/authContext';
import type {
  AdminUser,
  AdminUserDetail,
  UserAction,
  UserFilters,
  UserPage,
} from '../types/adminUsers';

export const PAGE_SIZE = 20;

type Request = AuthState['request'];

/** Query string for GET /admin/users from the page filters (empty filters are left out). */
export function usersQuery(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page));
  params.set('limit', String(PAGE_SIZE));
  return params.toString();
}

export const fetchUsers = (request: Request, filters: UserFilters) =>
  request<UserPage>(`/admin/users?${usersQuery(filters)}`);

export const fetchUser = (request: Request, id: string) =>
  request<{ user: AdminUserDetail }>(`/admin/users/${encodeURIComponent(id)}`);

/** Runs one admin action; `delete` returns nothing, the others the updated user. */
export async function runUserAction(
  request: Request,
  id: string,
  action: UserAction,
): Promise<AdminUser | null> {
  const path = `/admin/users/${encodeURIComponent(id)}`;
  switch (action) {
    case 'suspend':
    case 'reactivate': {
      const status = action === 'suspend' ? 'suspended' : 'active';
      return (
        await request<{ user: AdminUser }>(`${path}/status`, { method: 'PATCH', body: { status } })
      ).user;
    }
    case 'makeAdmin':
    case 'makeUser': {
      const role = action === 'makeAdmin' ? 'admin' : 'user';
      return (
        await request<{ user: AdminUser }>(`${path}/role`, { method: 'PATCH', body: { role } })
      ).user;
    }
    case 'delete':
      await request<void>(path, { method: 'DELETE' });
      return null;
  }
}

/** Which actions make sense for this user right now (never for your own account). */
export function availableActions(user: AdminUser, ownId: string | undefined): UserAction[] {
  if (user.id === ownId) return [];
  return [
    user.status === 'active' ? 'suspend' : 'reactivate',
    user.role === 'admin' ? 'makeUser' : 'makeAdmin',
    'delete',
  ];
}
