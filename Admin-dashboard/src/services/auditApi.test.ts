import { describe, expect, it } from 'vitest';
import { resources } from '../i18n';
import { AUDIT_ACTIONS, type AuditEntry } from '../types/audit';
import { actionKey, describeChange } from './auditApi';

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 'a1',
  at: '2026-11-17T12:00:00.000Z',
  actor: 'boss@example.com',
  action: 'user.suspend',
  targetType: 'user',
  target: 'amina@example.com',
  before: null,
  after: null,
  ip: null,
  ...over,
});

describe('describeChange', () => {
  it('lists the fields that changed, before → after', () => {
    expect(
      describeChange(entry({ before: { status: 'active' }, after: { status: 'suspended' } })),
    ).toEqual([{ field: 'status', from: 'active', to: 'suspended' }]);
  });

  it('compares lists by value and ignores updatedAt (job source edits)', () => {
    const before = { enabled: true, regions: ['somaliland'], priority: 100, updatedAt: '1' };
    expect(
      describeChange(
        entry({
          action: 'job_source.update',
          before,
          after: { ...before, regions: ['somaliland', 'somalia'], updatedAt: '2' },
        }),
      ),
    ).toEqual([{ field: 'regions', from: ['somaliland'], to: ['somaliland', 'somalia'] }]);
    expect(
      describeChange(
        entry({ action: 'job_source.disable', before, after: { ...before, enabled: false } }),
      ),
    ).toEqual([{ field: 'enabled', from: true, to: false }]);
  });

  it('is empty when there is no before/after pair (delete, denied attempt)', () => {
    expect(describeChange(entry({ action: 'user.delete', before: { email: 'x@y.z' } }))).toEqual(
      [],
    );
    expect(describeChange(entry({ action: 'admin.access_denied' }))).toEqual([]);
  });
});

describe('audit action labels', () => {
  it('every action has an English and a Somali label', () => {
    for (const action of AUDIT_ACTIONS) {
      const key = actionKey(action) as keyof typeof resources.en.translation.admin.audit.actions;
      expect(resources.en.translation.admin.audit.actions[key]).toBeTruthy();
      expect(resources.so.translation.admin.audit.actions[key]).toBeTruthy();
    }
  });
});
