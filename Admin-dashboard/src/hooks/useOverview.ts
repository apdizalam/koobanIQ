import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/authContext';
import type { Overview, Period } from '../types/overview';

export type OverviewState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: Overview };

type Result = { status: 'error' } | { status: 'ready'; data: Overview };

/** Loads the admin Overview numbers for a period; `reload` tries again after an error. */
export function useOverview(period: Period) {
  const { request } = useAuth();
  const [attempt, setAttempt] = useState(0);
  // Each result remembers which request it answers; anything older means "loading".
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
  const key = `${period}:${attempt}`;

  useEffect(() => {
    let active = true;
    request<Overview>(`/admin/overview?period=${period}`)
      .then((data) => active && setResult({ key, value: { status: 'ready', data } }))
      .catch(() => active && setResult({ key, value: { status: 'error' } }));
    return () => {
      active = false;
    };
  }, [request, period, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state: OverviewState = result?.key === key ? result.value : { status: 'loading' };
  return { state, reload };
}
