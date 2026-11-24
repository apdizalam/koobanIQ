import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import {
  INTERVIEWS_PAGE_SIZE,
  INTERVIEW_STATUSES,
  INTERVIEW_TYPES,
  fetchInterview,
  fetchInterviews,
  filtersFromParams,
  filtersToParams,
  jobLabel,
} from './interviewsApi';

const none = { status: '', type: '', language: '', period: '', page: 1 } as const;

describe('Interviews (read-only)', () => {
  it('lists interviews with every filter and paging', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchInterviews(request, {
      status: 'finished',
      type: 'job_specific',
      language: 'so',
      period: 'week',
      page: 2,
    });
    expect(request).toHaveBeenCalledWith(
      `/admin/interviews?status=finished&type=job_specific&language=so&period=week&page=2&limit=${INTERVIEWS_PAGE_SIZE}`,
    );
    await fetchInterviews(request, none);
    expect(request).toHaveBeenLastCalledWith(
      `/admin/interviews?page=1&limit=${INTERVIEWS_PAGE_SIZE}`,
    );
  });

  it('loads one interview by id', async () => {
    const request = vi.fn().mockResolvedValue({ interview: { id: 'i/1' } });
    await expect(fetchInterview(request, 'i/1')).resolves.toEqual({ id: 'i/1' });
    expect(request).toHaveBeenCalledWith('/admin/interviews/i%2F1');
  });

  it('reads filters from the address and ignores unknown values', () => {
    expect(
      filtersFromParams(
        new URLSearchParams('status=finished&type=technical&language=en&period=month&page=3'),
      ),
    ).toEqual({ status: 'finished', type: 'technical', language: 'en', period: 'month', page: 3 });
    expect(
      filtersFromParams(
        new URLSearchParams('status=done&type=oral&language=fr&period=hour&page=-2'),
      ),
    ).toEqual(none);
  });

  it('writes only the filters that are set', () => {
    expect(filtersToParams(none)).toEqual({});
    expect(filtersToParams({ ...none, type: 'general', page: 4 })).toEqual({
      type: 'general',
      page: '4',
    });
  });

  it('names the job with the employer when there is one', () => {
    expect(jobLabel({ role: 'Data Officer', employer: 'Example Org' })).toBe(
      'Data Officer · Example Org',
    );
    expect(jobLabel({ role: 'Cashier', employer: null })).toBe('Cashier');
    expect(jobLabel({ role: 'Cashier', employer: ' ' })).toBe('Cashier');
  });

  it('every status and type has a label in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const { interviews, overview } = resources[lang].translation.admin;
      for (const s of INTERVIEW_STATUSES)
        expect(interviews.statuses[s], `${lang}:${s}`).toBeTruthy();
      for (const ty of INTERVIEW_TYPES) expect(interviews.types[ty], `${lang}:${ty}`).toBeTruthy();
      expect(overview.activity.interviewsFinished, lang).toBeTruthy();
    }
  });
});
