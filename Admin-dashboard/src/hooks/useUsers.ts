import { useAuth } from '../auth/authContext';
import { fetchUser, fetchUsers, usersQuery } from '../services/adminUsersApi';
import type { AdminUserDetail, UserFilters, UserPage } from '../types/adminUsers';
import { useLoad } from './useLoad';

/** One page of the users list for these filters. */
export function useUsers(filters: UserFilters) {
  const { request } = useAuth();
  return useLoad<UserPage>(usersQuery(filters), () => fetchUsers(request, filters));
}

/** One user's details. */
export function useUser(id: string) {
  const { request } = useAuth();
  return useLoad<{ user: AdminUserDetail }>(`user:${id}`, () => fetchUser(request, id));
}
