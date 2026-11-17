import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { fetchUser, fetchUsers, usersQuery } from '../services/adminUsersApi';
import type { AdminUserDetail, UserFilters, UserPage } from '../types/adminUsers';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };
type Result<T> = { status: 'error' } | { status: 'ready'; data: T };

/**
 * Loads data for `key`; anything stored for an older key counts as "loading".
 * (Same pattern as useOverview: no setState directly inside the effect.)
 */
function useLoad<T>(key: string, load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: Result<T> } | null>(null);
  const fullKey = `${key}#${attempt}`;

  useEffect(() => {
    let active = true;
    load()
      .then((data) => active && setResult({ key: fullKey, value: { status: 'ready', data } }))
      .catch(() => active && setResult({ key: fullKey, value: { status: 'error' } }));
    return () => {
      active = false;
    };
    // `load` changes with `key`, which is part of fullKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state: Load<T> = result?.key === fullKey ? result.value : { status: 'loading' };
  // While a reload of the same thing runs, the last loaded data stays on screen (no flicker).
  const sameThing = result?.key.slice(0, result.key.lastIndexOf('#')) === key;
  const previous = sameThing && result?.value.status === 'ready' ? result.value.data : null;
  return { state, reload, previous };
}

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
