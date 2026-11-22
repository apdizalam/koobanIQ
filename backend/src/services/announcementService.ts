import type { Request } from 'express';
import { AppError } from '../lib/errors.js';
import { isExpoPushToken, sendPush, type PushMessage } from '../lib/push.js';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  Announcement,
  type AnnouncementAudience,
  type AnnouncementDocument,
} from '../models/Announcement.js';
import { Notification, PushToken } from '../models/Notification.js';
import { User } from '../models/User.js';
import { recordAudit } from './auditService.js';

export interface AnnouncementInput {
  title: { en: string; so: string };
  body: { en: string; so: string };
  audience: AnnouncementAudience;
  push: boolean;
}

/** Notifications are written in batches of this many users. */
const INSERT_BATCH = 1000;

/** Active users the audience means ("en" = everyone whose app is not in Somali). */
const audienceFilter = (audience: AnnouncementAudience): Record<string, unknown> => ({
  status: 'active',
  ...(audience === 'so'
    ? { preferredLanguage: 'so' }
    : audience === 'en'
      ? { preferredLanguage: { $ne: 'so' } }
      : {}),
});

/** Checks the admin's form; field errors use the shared validation keys. */
export function parseAnnouncement(body: unknown): AnnouncementInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const textField = (field: string, value: unknown, max: number) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) errors[field] = 'required';
    else if (text.length > max) errors[field] = 'textTooLong';
    return text;
  };
  const title = (b.title ?? {}) as Record<string, unknown>;
  const text = (b.body ?? {}) as Record<string, unknown>;
  const input = {
    title: {
      en: textField('titleEn', title.en, ANNOUNCEMENT_TITLE_MAX),
      so: textField('titleSo', title.so, ANNOUNCEMENT_TITLE_MAX),
    },
    body: {
      en: textField('bodyEn', text.en, ANNOUNCEMENT_BODY_MAX),
      so: textField('bodySo', text.so, ANNOUNCEMENT_BODY_MAX),
    },
    audience: b.audience as AnnouncementAudience,
    push: b.push as boolean,
  };
  if (!(ANNOUNCEMENT_AUDIENCES as readonly unknown[]).includes(b.audience)) {
    errors.audience = 'choiceInvalid';
  }
  if (typeof b.push !== 'boolean') errors.push = 'choiceInvalid';
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', errors);
  }
  return input;
}

/** GET /admin/announcements/audience: how many active users each audience reaches now. */
export async function audienceCounts() {
  const [all, en, so] = await Promise.all(
    ANNOUNCEMENT_AUDIENCES.map((a) => User.countDocuments(audienceFilter(a))),
  );
  return { all, en, so };
}

async function toAdminAnnouncement(doc: AnnouncementDocument, readCount?: number) {
  const author = await User.findById(doc.createdBy, { email: 1 }).lean();
  return {
    id: String(doc._id),
    title: { en: doc.title!.en, so: doc.title!.so },
    body: { en: doc.body!.en, so: doc.body!.so },
    audience: doc.audience,
    push: doc.push,
    recipients: doc.recipients,
    pushed: doc.pushed,
    read:
      readCount ??
      (await Notification.countDocuments({ announcementId: doc._id, readAt: { $ne: null } })),
    createdBy: author?.email ?? null,
    createdAt: doc.createdAt,
  };
}

/**
 * POST /admin/announcements (TIQ-33): every active user in the audience gets
 * one in-app notification with the text in both languages (the app shows its
 * own language); with `push`, users who allow push get it on their phones in
 * their chosen language. Audited.
 */
export async function sendAnnouncement(req: Request, input: AnnouncementInput) {
  const doc = await Announcement.create({ ...input, createdBy: req.user!._id });
  const users = await User.find(audienceFilter(input.audience), {
    preferredLanguage: 1,
    notifyPush: 1,
  }).lean();

  // In-app items (one per user and announcement, unique).
  const itemOf = new Map<string, string>();
  for (let i = 0; i < users.length; i += INSERT_BATCH) {
    const created = await Notification.insertMany(
      users.slice(i, i + INSERT_BATCH).map((u) => ({
        userId: u._id,
        type: 'announcement',
        announcementId: doc._id,
        message: { title: input.title, body: input.body },
      })),
    );
    for (const n of created) itemOf.set(String(n.userId), String(n._id));
  }

  // Push in each user's own language, only to users who allow it.
  let pushed = 0;
  if (input.push) {
    const allowing = users.filter((u) => u.notifyPush !== false);
    const langOf = new Map(
      allowing.map((u) => [String(u._id), u.preferredLanguage === 'so' ? 'so' : 'en'] as const),
    );
    const tokens = await PushToken.find({ userId: { $in: allowing.map((u) => u._id) } }).lean();
    const messages: PushMessage[] = tokens
      .filter((t) => isExpoPushToken(t.token))
      .map((t) => {
        const lang = langOf.get(String(t.userId)) ?? 'en';
        return {
          to: t.token,
          title: input.title[lang],
          body: input.body[lang],
          data: { type: 'announcement', notificationId: itemOf.get(String(t.userId)) ?? '' },
        };
      });
    try {
      const { invalidTokens } = await sendPush(messages);
      if (invalidTokens.length > 0) await PushToken.deleteMany({ token: { $in: invalidTokens } });
      const reached = new Set(tokens.map((t) => String(t.userId)));
      pushed = reached.size;
      if (reached.size > 0) {
        await Notification.updateMany(
          { announcementId: doc._id, userId: { $in: [...reached] } },
          { pushSent: true },
        );
      }
    } catch (err) {
      console.warn('[announce] push not sent:', (err as Error).message);
    }
  }

  doc.recipients = users.length;
  doc.pushed = pushed;
  await doc.save();
  await recordAudit(req, {
    action: 'announcement.send',
    targetType: 'announcement',
    targetId: String(doc._id),
    after: {
      title: input.title.en,
      audience: input.audience,
      push: input.push,
      recipients: users.length,
    },
  });
  return { announcement: await toAdminAnnouncement(doc, 0) };
}

/** GET /admin/announcements: newest first, with how many got and read each one. */
export async function listAnnouncements(query: { page: number; limit: number }) {
  const [docs, total] = await Promise.all([
    Announcement.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Announcement.countDocuments(),
  ]);
  const reads = await Notification.aggregate<{ _id: unknown; n: number }>([
    { $match: { announcementId: { $in: docs.map((d) => d._id) }, readAt: { $ne: null } } },
    { $group: { _id: '$announcementId', n: { $sum: 1 } } },
  ]);
  const readOf = new Map(reads.map((r) => [String(r._id), r.n]));
  const items = await Promise.all(
    docs.map((d) => toAdminAnnouncement(d, readOf.get(String(d._id)) ?? 0)),
  );
  return { items, total, page: query.page, limit: query.limit };
}
