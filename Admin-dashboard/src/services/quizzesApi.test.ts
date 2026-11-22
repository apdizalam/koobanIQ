import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { AUDIT_ACTIONS } from '../types/audit';
import { actionKey } from './auditApi';
import {
  FLAG_REASON_MAX,
  QUIZZES_PAGE_SIZE,
  QUIZ_STATUSES,
  fetchQuizzes,
  flagQuestion,
  optionLetter,
  unflagQuestion,
  validReason,
} from './quizzesApi';

describe('skills & assessments API (TIQ-33)', () => {
  it('lists quizzes with status and skill filters', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchQuizzes(request, { status: 'finished', skill: ' Excel ', page: 2 });
    expect(request).toHaveBeenCalledWith(
      `/admin/assessments?status=finished&skill=Excel&page=2&limit=${QUIZZES_PAGE_SIZE}`,
    );
  });

  it('flags with POST { reason } and removes the flag with DELETE', async () => {
    const request = vi.fn().mockResolvedValue({ assessment: { id: 'a1' } });
    await flagQuestion(request, 'a1', 'q2', '  Two options are right ');
    expect(request).toHaveBeenCalledWith('/admin/assessments/a1/questions/q2/flag', {
      method: 'POST',
      body: { reason: 'Two options are right' },
    });
    await unflagQuestion(request, 'a1', 'q2');
    expect(request).toHaveBeenLastCalledWith('/admin/assessments/a1/questions/q2/flag', {
      method: 'DELETE',
    });
  });

  it('a reason must be written, up to 300 characters', () => {
    expect(validReason('Wrong answer key')).toBe(true);
    expect(validReason('   ')).toBe(false);
    expect(validReason('x'.repeat(FLAG_REASON_MAX + 1))).toBe(false);
  });

  it('shows answers as A–D', () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('statuses, levels and audit actions have labels in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const admin = resources[lang].translation.admin;
      for (const s of QUIZ_STATUSES) expect(admin.quizzes.statuses[s], `${lang}:${s}`).toBeTruthy();
      const actions = admin.audit.actions as Record<string, string>;
      for (const a of AUDIT_ACTIONS) expect(actions[actionKey(a)], `${lang}:${a}`).toBeTruthy();
    }
  });
});
