import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import {
  AUDIENCES,
  BODY_MAX,
  TITLE_MAX,
  cleanDraft,
  draftProblem,
  sendAnnouncement,
  type AnnouncementDraft,
} from './announcementsApi';

const draft = (over: Partial<AnnouncementDraft> = {}): AnnouncementDraft => ({
  title: { en: 'New job sources', so: 'Ilo shaqo oo cusub' },
  body: { en: 'More career pages.', so: 'Bogag badan.' },
  audience: 'all',
  push: true,
  ...over,
});

describe('announcements (TIQ-33)', () => {
  it('needs the title and message in both languages', () => {
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem(draft({ title: { en: 'Only English', so: '   ' } }))).toBe('missing');
    expect(draftProblem(draft({ body: { en: '', so: 'Qoraal' } }))).toBe('missing');
  });

  it('keeps the same length limits as the server', () => {
    expect(draftProblem(draft({ title: { en: 'x'.repeat(TITLE_MAX), so: 'y' } }))).toBeNull();
    expect(draftProblem(draft({ title: { en: 'x'.repeat(TITLE_MAX + 1), so: 'y' } }))).toBe(
      'tooLong',
    );
    expect(draftProblem(draft({ body: { en: 'x', so: 'y'.repeat(BODY_MAX + 1) } }))).toBe(
      'tooLong',
    );
  });

  it('sends the trimmed draft with POST', async () => {
    const request = vi.fn().mockResolvedValue({ announcement: { id: 'a1' } });
    const sent = cleanDraft(draft({ title: { en: '  Hello ', so: ' Salaan  ' } }));
    expect(await sendAnnouncement(request, sent)).toEqual({ id: 'a1' });
    expect(request).toHaveBeenCalledWith('/admin/announcements', {
      method: 'POST',
      body: { ...draft(), title: { en: 'Hello', so: 'Salaan' } },
    });
  });

  it('every audience has a label in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const announce = resources[lang].translation.admin.announce;
      for (const a of AUDIENCES) {
        expect(announce.audiences[a], `${lang}:${a}`).toBeTruthy();
        expect(announce.audienceShort[a], `${lang}:${a}`).toBeTruthy();
      }
    }
  });
});
