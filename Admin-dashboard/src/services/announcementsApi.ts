import type { AuthState } from '../auth/authContext';

type Request = AuthState['request'];

/** Same limits as the backend (models/Announcement.ts). */
export const TITLE_MAX = 80;
export const BODY_MAX = 500;

export const AUDIENCES = ['all', 'en', 'so'] as const;
export type Audience = (typeof AUDIENCES)[number];

export interface AnnouncementDraft {
  title: { en: string; so: string };
  body: { en: string; so: string };
  audience: Audience;
  push: boolean;
}

/** One sent announcement (GET /admin/announcements). */
export interface Announcement {
  id: string;
  title: { en: string; so: string };
  body: { en: string; so: string };
  audience: Audience;
  push: boolean;
  recipients: number;
  pushed: number;
  read: number;
  createdBy: string | null;
  createdAt: string;
}

export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  page: number;
  limit: number;
}

export const fetchAnnouncements = (request: Request) =>
  request<AnnouncementPage>('/admin/announcements?page=1&limit=50');

export const fetchAudienceCounts = async (request: Request) =>
  (await request<{ counts: Record<Audience, number> }>('/admin/announcements/audience')).counts;

export const sendAnnouncement = async (request: Request, draft: AnnouncementDraft) =>
  (
    await request<{ announcement: Announcement }>('/admin/announcements', {
      method: 'POST',
      body: draft,
    })
  ).announcement;

/**
 * What stops the form from being sent, or null when it can go: both languages
 * are required, within the limits (the server checks the same).
 */
export function draftProblem(draft: AnnouncementDraft): 'missing' | 'tooLong' | null {
  const texts = [draft.title.en, draft.title.so, draft.body.en, draft.body.so].map((t) => t.trim());
  if (texts.some((t) => t.length === 0)) return 'missing';
  const [titleEn, titleSo, bodyEn, bodySo] = texts;
  if (titleEn.length > TITLE_MAX || titleSo.length > TITLE_MAX) return 'tooLong';
  if (bodyEn.length > BODY_MAX || bodySo.length > BODY_MAX) return 'tooLong';
  return null;
}

/** The draft as it is sent: texts trimmed. */
export const cleanDraft = (draft: AnnouncementDraft): AnnouncementDraft => ({
  ...draft,
  title: { en: draft.title.en.trim(), so: draft.title.so.trim() },
  body: { en: draft.body.en.trim(), so: draft.body.so.trim() },
});
