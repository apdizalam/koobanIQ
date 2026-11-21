import type { AuthState } from '../auth/authContext';
import type {
  AdminRunDetail,
  AdminRunRow,
  AdminSchedule,
  RunPage,
  RunStatus,
  SchedulePage,
} from '../types/research';

type Request = AuthState['request'];

export const RUNS_PAGE_SIZE = 25;

export const fetchRuns = (request: Request, filters: { status: '' | RunStatus; page: number }) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page));
  params.set('limit', String(RUNS_PAGE_SIZE));
  return request<RunPage>(`/admin/research-runs?${params.toString()}`);
};

export const fetchRun = async (request: Request, id: string) =>
  (await request<{ run: AdminRunDetail }>(`/admin/research-runs/${encodeURIComponent(id)}`)).run;

/** Starts the same search again as a new run; answers with the new run. */
export const retryRun = async (request: Request, id: string) =>
  (
    await request<{ run: { id: string } }>(`/admin/research-runs/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    })
  ).run;

export const fetchSchedules = (request: Request, page: number) =>
  request<SchedulePage>(`/admin/research-schedules?page=${page}&limit=${RUNS_PAGE_SIZE}`);

export const setScheduleEnabled = async (request: Request, id: string, enabled: boolean) =>
  (
    await request<{ schedule: AdminSchedule }>(
      `/admin/research-schedules/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { enabled } },
    )
  ).schedule;

/** What went wrong in a run, as pieces the page translates (null: nothing). */
export function runProblem(run: Pick<AdminRunRow, 'failedSources' | 'error'>) {
  if (run.error) return { kind: 'error' as const, text: run.error };
  if (run.failedSources.length > 0) return { kind: 'sources' as const, keys: run.failedSources };
  return null;
}
