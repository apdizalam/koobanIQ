import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { CVS_PAGE_SIZE, CV_STATUSES, fetchCvs, jobLabel } from './cvsApi';

describe('CVs (TIQ-33, read-only)', () => {
  it('lists CVs with the status filter and paging', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchCvs(request, { status: 'approved', page: 3 });
    expect(request).toHaveBeenCalledWith(
      `/admin/cvs?status=approved&page=3&limit=${CVS_PAGE_SIZE}`,
    );
  });

  it('names the job ad by title and company, whichever it has', () => {
    expect(jobLabel({ jobTitle: 'Data Officer', company: 'Example Org' })).toBe(
      'Data Officer · Example Org',
    );
    expect(jobLabel({ jobTitle: null, company: 'Example Org' })).toBe('Example Org');
    expect(jobLabel({ jobTitle: ' ', company: null })).toBeNull();
  });

  it('every status has a label in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const cvs = resources[lang].translation.admin.cvs;
      for (const s of CV_STATUSES) {
        expect(cvs.statuses[s], `${lang}:${s}`).toBeTruthy();
        expect(cvs.cards[s], `${lang}:${s}`).toBeTruthy();
      }
    }
  });
});
