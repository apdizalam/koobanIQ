import { describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../auth/authContext';
import { resources } from '../i18n';
import { NAV_ITEMS } from '../constants/navigation';
import {
  REASON_MAX,
  otherValue,
  reasonProblem,
  updateAiPersonalData,
  updateTestAccount,
} from './privacyApi';

describe('reasonProblem (same rule as the server: 10–500 characters, trimmed)', () => {
  it('refuses empty, short and too long reasons', () => {
    expect(reasonProblem('')).toBe('tooShort');
    expect(reasonProblem('   short   ')).toBe('tooShort');
    expect(reasonProblem('x'.repeat(REASON_MAX + 1))).toBe('tooLong');
  });

  it('accepts 10 to 500 characters', () => {
    expect(reasonProblem('Paid tier ok')).toBeNull();
    expect(reasonProblem('x'.repeat(REASON_MAX))).toBeNull();
  });
});

describe('otherValue', () => {
  it('switches between blocked and allowed', () => {
    expect(otherValue('blocked')).toBe('allowed');
    expect(otherValue('allowed')).toBe('blocked');
  });
});

describe('requests', () => {
  it('PUTs the setting and PATCHes the test account with a trimmed reason', async () => {
    const request = vi.fn(async (path: string) =>
      path.includes('test-account') ? { user: { id: 'u1' } } : { setting: { value: 'allowed' } },
    );
    const send = request as unknown as AuthState['request'];
    await updateAiPersonalData(send, 'allowed', '  Paid tier verified by the owner.  ');
    await updateTestAccount(send, 'a/b', true, ' Fictional data for CV tests. ');
    expect(request.mock.calls).toEqual([
      [
        '/admin/settings/ai-personal-data',
        { method: 'PUT', body: { value: 'allowed', reason: 'Paid tier verified by the owner.' } },
      ],
      [
        '/admin/users/a%2Fb/test-account',
        { method: 'PATCH', body: { testAccount: true, reason: 'Fictional data for CV tests.' } },
      ],
    ]);
  });
});

describe('page wiring and texts', () => {
  it('the AI privacy page is in the sidebar', () => {
    expect(NAV_ITEMS.find((item) => item.key === 'privacy')).toMatchObject({
      path: '/ai-privacy',
      available: true,
    });
  });

  it('every privacy and test-account text exists in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const admin = resources[lang].translation.admin;
      for (const key of [
        'title',
        'changeTo',
        'changeMessage',
        'confirmAllow',
        'tooShort',
        'tooLong',
        'confirmNeeded',
        'reason',
        'reasonHint',
      ] as const) {
        expect(admin.privacy[key], `${lang} admin.privacy.${key}`).toBeTruthy();
      }
      expect(admin.privacy.values.blocked).toBeTruthy();
      expect(admin.privacy.values.allowed).toBeTruthy();
      expect(admin.users.testDialogOn).toBeTruthy();
      expect(admin.users.testDialogOff).toBeTruthy();
      expect(admin.audit.reason).toContain('{{reason}}');
      expect(admin.audit.actions.settings_ai_personal_data).toBeTruthy();
      expect(admin.audit.actions.user_test_account).toBeTruthy();
    }
  });
});
