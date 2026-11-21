import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { AUDIT_ACTIONS } from '../types/audit';
import { RUN_STATUSES, canRetry } from '../types/research';
import { actionKey } from './auditApi';
import {
  RUNS_PAGE_SIZE,
  fetchRuns,
  fetchSchedules,
  retryRun,
  runProblem,
  setScheduleEnabled,
} from './researchApi';

describe('research runs API (TIQ-33)', () => {
  it('lists runs with the status filter and paging', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchRuns(request, { status: 'failed', page: 2 });
    expect(request).toHaveBeenCalledWith(
      `/admin/research-runs?status=failed&page=2&limit=${RUNS_PAGE_SIZE}`,
    );
    await fetchRuns(request, { status: '', page: 1 });
    expect(request).toHaveBeenLastCalledWith(`/admin/research-runs?page=1&limit=${RUNS_PAGE_SIZE}`);
  });

  it('retries with POST and pauses / resumes with PATCH { enabled }', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ run: { id: 'new-run' } })
      .mockResolvedValueOnce({ schedule: { id: 's1', enabled: false } });
    expect(await retryRun(request, 'r1')).toEqual({ id: 'new-run' });
    expect(request).toHaveBeenCalledWith('/admin/research-runs/r1/retry', { method: 'POST' });
    await setScheduleEnabled(request, 's1', false);
    expect(request).toHaveBeenLastCalledWith('/admin/research-schedules/s1', {
      method: 'PATCH',
      body: { enabled: false },
    });
    await fetchSchedules(vi.fn().mockResolvedValue({}), 1);
  });

  it('only failed or partly failed runs offer a retry', () => {
    expect(RUN_STATUSES.filter(canRetry)).toEqual(['partial', 'failed']);
  });

  it('describes what went wrong: the run error first, else the failing sources', () => {
    expect(runProblem({ error: 'Server restarted', failedSources: ['a'] })).toEqual({
      kind: 'error',
      text: 'Server restarted',
    });
    expect(runProblem({ error: null, failedSources: ['a', 'b'] })).toEqual({
      kind: 'sources',
      keys: ['a', 'b'],
    });
    expect(runProblem({ error: null, failedSources: [] })).toBeNull();
  });

  it('every run status and audit action has a label in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const admin = resources[lang].translation.admin;
      for (const s of RUN_STATUSES) expect(admin.runs.statuses[s], `${lang}:${s}`).toBeTruthy();
      const actions = admin.audit.actions as Record<string, string>;
      for (const a of AUDIT_ACTIONS) expect(actions[actionKey(a)], `${lang}:${a}`).toBeTruthy();
    }
  });
});
