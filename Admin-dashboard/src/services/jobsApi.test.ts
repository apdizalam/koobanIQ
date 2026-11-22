import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { AUDIT_ACTIONS } from '../types/audit';
import { actionKey } from './auditApi';
import {
  JOBS_PAGE_SIZE,
  JOB_STATES,
  REMOVE_REASONS,
  fetchJobs,
  placeLabel,
  removeExpiredJobs,
  removeJob,
  restoreJob,
} from './jobsApi';

describe('jobs & matching API (TIQ-33)', () => {
  it('lists jobs with state, source and text filters', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchJobs(request, { state: 'active', source: 'career-pages', q: ' data ', page: 2 });
    expect(request).toHaveBeenCalledWith(
      `/admin/jobs?state=active&source=career-pages&q=data&page=2&limit=${JOBS_PAGE_SIZE}`,
    );
  });

  it('removes with a reason, restores, and removes all expired', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ job: { id: 'j1', state: 'removed' } })
      .mockResolvedValueOnce({ job: { id: 'j1', state: 'active' } })
      .mockResolvedValueOnce({ removed: 3 });
    await removeJob(request, 'j1', 'invalid');
    expect(request).toHaveBeenCalledWith('/admin/jobs/j1/remove', {
      method: 'POST',
      body: { reason: 'invalid' },
    });
    await restoreJob(request, 'j1');
    expect(request).toHaveBeenLastCalledWith('/admin/jobs/j1/restore', { method: 'POST' });
    expect(await removeExpiredJobs(request)).toBe(3);
  });

  it('writes the place as city, region', () => {
    expect(placeLabel('Hargeisa', 'Somaliland')).toBe('Hargeisa, Somaliland');
    expect(placeLabel(null, 'Remote')).toBe('Remote');
  });

  it('states, reasons and audit actions have labels in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const admin = resources[lang].translation.admin;
      for (const s of JOB_STATES) expect(admin.jobs.states[s], `${lang}:${s}`).toBeTruthy();
      for (const r of REMOVE_REASONS) expect(admin.jobs.reasons[r], `${lang}:${r}`).toBeTruthy();
      const actions = admin.audit.actions as Record<string, string>;
      for (const a of AUDIT_ACTIONS) expect(actions[actionKey(a)], `${lang}:${a}`).toBeTruthy();
    }
  });
});
