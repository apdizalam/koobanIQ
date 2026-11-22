import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const NOTIFICATION_TYPES = ['strong_match', 'announcement'] as const;

/** Both languages of an admin announcement (TIQ-33). */
const bilingual = { en: { type: String }, so: { type: String } };

/**
 * `notifications` collection (TIQ-22): the in-app list.
 * - `strong_match`: one item per user and job (unique), so a job is announced
 *   once, ever. Texts are not stored: the app writes them in its current
 *   language from `values`; push and email use the user's language when sent.
 * - `announcement` (TIQ-33): one item per user and announcement (unique), with
 *   the admin's text in English and Somali in `message`.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    /** strong_match: the job. */
    jobId: {
      type: Types.ObjectId,
      ref: 'Job',
      default: null,
      required(this: { type: string }) {
        return this.type === 'strong_match';
      },
    },
    /** strong_match: what the texts need (job title, employer, score). */
    values: {
      title: { type: String },
      employer: { type: String },
      score: { type: Number },
    },
    /** announcement: which one, and its text in both languages. */
    announcementId: { type: Types.ObjectId, ref: 'Announcement', default: null },
    message: { title: bilingual, body: bilingual },
    /** The run that found it (scheduled or started by hand). */
    runId: { type: Types.ObjectId, ref: 'ResearchRun', default: null },
    pushSent: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Named indexes (TIQ-33): the first replaces the old plain unique index
// `userId_1_type_1_jobId_1`, which would treat every announcement as the same "job".
notificationSchema.index(
  { userId: 1, type: 1, jobId: 1 },
  {
    unique: true,
    name: 'one_alert_per_job',
    partialFilterExpression: { type: 'strong_match' },
  },
);
notificationSchema.index(
  { userId: 1, announcementId: 1 },
  {
    unique: true,
    name: 'one_item_per_announcement',
    partialFilterExpression: { type: 'announcement' },
  },
);
notificationSchema.index({ userId: 1, createdAt: -1 });

export type NotificationDocument = HydratedDocument<InferSchemaType<typeof notificationSchema>>;
export const Notification = model('Notification', notificationSchema);

export function toPublicNotification(n: NotificationDocument) {
  if (n.type === 'announcement') {
    return {
      id: String(n._id),
      type: 'announcement' as const,
      jobId: null,
      message: {
        title: { en: n.message?.title?.en ?? '', so: n.message?.title?.so ?? '' },
        body: { en: n.message?.body?.en ?? '', so: n.message?.body?.so ?? '' },
      },
      read: !!n.readAt,
      createdAt: n.createdAt,
    };
  }
  return {
    id: String(n._id),
    type: 'strong_match' as const,
    jobId: String(n.jobId),
    values: {
      title: n.values?.title ?? '',
      employer: n.values?.employer ?? '',
      score: n.values?.score ?? 0,
    },
    read: !!n.readAt,
    createdAt: n.createdAt,
  };
}

/**
 * `pushTokens` collection: the user's phones (Expo push tokens). A token
 * belongs to one account at a time (signing in elsewhere moves it).
 */
const pushTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android', 'web', 'other'], default: 'other' },
  },
  { timestamps: true },
);

export const PushToken = model('PushToken', pushTokenSchema);
