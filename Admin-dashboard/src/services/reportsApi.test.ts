import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { AUDIT_ACTIONS } from '../types/audit';
import { actionKey } from './auditApi';
import { EXPORT_KINDS, EXPORT_PERIODS, fetchExport, saveCsv } from './reportsApi';

describe('reports (TIQ-33)', () => {
  it('asks for one kind and period', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchExport(request, 'usage', 'week');
    expect(request).toHaveBeenCalledWith('/admin/reports/usage?period=week');
  });

  it('saves the CSV as a download with its file name', () => {
    const click = vi.fn();
    const link = { href: '', download: '', click, remove: vi.fn() };
    const doc = {
      createElement: vi.fn(() => link),
      body: { appendChild: vi.fn() },
    } as unknown as Document;
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    saveCsv({ filename: 'kobaniq-users-all-2026-11-22.csv', csv: 'email\r\n' }, doc);
    expect(link.download).toBe('kobaniq-users-all-2026-11-22.csv');
    expect(link.href).toBe('blob:test');
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    create.mockRestore();
    revoke.mockRestore();
  });

  it('every kind, period and audit action has a label in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const admin = resources[lang].translation.admin;
      for (const k of EXPORT_KINDS)
        expect(admin.reports.kinds[k].label, `${lang}:${k}`).toBeTruthy();
      for (const p of EXPORT_PERIODS) expect(admin.reports.periods[p], `${lang}:${p}`).toBeTruthy();
      const actions = admin.audit.actions as Record<string, string>;
      for (const a of AUDIT_ACTIONS) expect(actions[actionKey(a)], `${lang}:${a}`).toBeTruthy();
    }
  });
});
