import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { translate } from '../lib/i18n.js';
import { sendEmail } from '../lib/mailer.js';
import { isExpoPushToken, sendPush, type PushMessage } from '../lib/push.js';
import { isItemId } from '../lib/validateProfile.js';
import { Job } from '../models/Job.js';
import { Notification, PushToken, toPublicNotification } from '../models/Notification.js';
import { ResearchRun } from '../models/ResearchRun.js';
import { User, type UserDocument } from '../models/User.js';
import { matchJobs } from './jobMatchService.js';

/** Most pushes (and emails) one search sends; more strong matches are in the in-app list only. */
export const MAX_ALERTS_PER_RUN = 5;

type Lang = 'en' | 'so';
const langOf = (user: UserDocument): Lang => (user.preferredLanguage === 'so' ? 'so' : 'en');
const text = (lang: Lang, key: string, vars: Record<string, string | number>) =>
  translate(lang, `server.notifications.${key}`, vars) ?? key;

/**
 * After a search has finished (TIQ-22): every job in it that is a strong,
 * recommended match for the user and was never announced before gets exactly
 * one in-app item (unique per user and job), one push to the user's phones and
 * one email — each only when the user allows it (email also only when the
 * server switch is on). Never throws into the search: failures are logged.
 */
export async function notifyStrongMatches(runId: Types.ObjectId, jobIds: Types.ObjectId[]) {
  const run = await ResearchRun.findById(runId);
  if (!run || jobIds.length === 0) return 0;
  const user = await User.findById(run.userId);
  if (!user || user.status !== 'active') return 0;

  const jobs = await Job.find({ _id: { $in: jobIds } });
  const { recommended } = await matchJobs(user._id, jobs, run.regions);
  const strong = recommended.filter((r) => r.match.category === 'strong');

  const created = [];
  for (const { job, match } of strong) {
    try {
      const doc = await Notification.create({
        userId: user._id,
        type: 'strong_match',
        jobId: job.id,
        values: { title: job.title, employer: job.employer, score: match.score },
        runId: run._id,
      });
      created.push(doc);
    } catch (err) {
      // Already announced (unique index): never again.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  if (created.length === 0) return 0;

  const lang = langOf(user);
  const alerts = created.slice(0, MAX_ALERTS_PER_RUN);

  if (user.notifyPush) {
    const tokens = await PushToken.find({ userId: user._id });
    const messages: PushMessage[] = alerts.flatMap((n) =>
      tokens.map((t) => ({
        to: t.token,
        title: text(lang, 'strongMatch.title', { score: n.values!.score }),
        body: text(lang, 'strongMatch.body', {
          title: n.values!.title,
          employer: n.values!.employer,
        }),
        data: { type: 'strong_match', jobId: String(n.jobId), notificationId: String(n._id) },
      })),
    );
    try {
      const { invalidTokens } = await sendPush(messages);
      if (invalidTokens.length > 0) await PushToken.deleteMany({ token: { $in: invalidTokens } });
      if (messages.length > 0) {
        await Notification.updateMany(
          { _id: { $in: alerts.map((n) => n._id) } },
          { pushSent: true },
        );
      }
    } catch (err) {
      console.warn('[notify] push not sent:', (err as Error).message);
    }
  }

  if (user.notifyEmail && env.notificationEmailsEnabled) {
    const lines = alerts.map((n) =>
      text(lang, 'strongMatch.body', { title: n.values!.title, employer: n.values!.employer }),
    );
    try {
      await sendEmail({
        to: user.email,
        subject: text(lang, 'email.subject', { count: created.length }),
        text: [
          text(lang, 'email.intro', { count: created.length }),
          '',
          ...lines.map((l) => `- ${l}`),
          '',
          text(lang, 'email.footer', {}),
        ].join('\n'),
      });
      await Notification.updateMany(
        { _id: { $in: alerts.map((n) => n._id) } },
        { emailSent: true },
      );
    } catch (err) {
      console.warn('[notify] email not sent:', (err as Error).message);
    }
  }
  return created.length;
}

// ------------------------------------------------------------------ the user's side

/** GET /notifications: newest first, with the unread count. */
export async function listNotifications(userId: Types.ObjectId) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(100),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  return { notifications: items.map(toPublicNotification), unread };
}

export async function markRead(userId: Types.ObjectId, id: unknown) {
  const doc = isItemId(id) ? await Notification.findOne({ _id: id, userId }) : null;
  if (!doc) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  if (!doc.readAt) {
    doc.readAt = new Date();
    await doc.save();
  }
  return toPublicNotification(doc);
}

export async function markAllRead(userId: Types.ObjectId) {
  await Notification.updateMany({ userId, readAt: null }, { readAt: new Date() });
}

export function settingsOf(user: UserDocument) {
  return {
    push: user.notifyPush !== false,
    email: user.notifyEmail !== false,
    /** Email can only reach users once the server switch is on (domain verified). */
    emailAvailable: env.notificationEmailsEnabled,
  };
}

/** PUT /notifications/settings { push?, email? } */
export async function updateSettings(
  user: UserDocument,
  changes: { push?: boolean; email?: boolean },
) {
  if (changes.push !== undefined) user.notifyPush = changes.push;
  if (changes.email !== undefined) user.notifyEmail = changes.email;
  await user.save();
  return settingsOf(user);
}

/** POST /notifications/push-token { token, platform }: this phone gets the user's pushes. */
export async function registerPushToken(userId: Types.ObjectId, token: unknown, platform: unknown) {
  if (!isExpoPushToken(token)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      token: 'pushTokenInvalid',
    });
  }
  const p = ['ios', 'android', 'web'].includes(platform as string) ? (platform as string) : 'other';
  await PushToken.updateOne({ token }, { $set: { userId, platform: p } }, { upsert: true });
}

/** DELETE /notifications/push-token { token }: on sign-out, this phone stops getting pushes. */
export async function removePushToken(userId: Types.ObjectId, token: unknown) {
  if (typeof token === 'string') await PushToken.deleteOne({ userId, token });
}

/** Deleting an account deletes its notifications and push tokens. */
export async function deleteNotifications(userId: Types.ObjectId) {
  await Promise.all([Notification.deleteMany({ userId }), PushToken.deleteMany({ userId })]);
}
