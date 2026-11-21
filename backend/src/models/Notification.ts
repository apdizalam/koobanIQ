import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const NOTIFICATION_TYPES = ['strong_match'] as const;

/**
 * `notifications` collection (TIQ-22): the in-app list. One item per user and
 * job for a new strong match (unique index), so a job is announced once, ever.
 * Texts are not stored: the app shows them in its current language from
 * `type` + `values`; push and email are written in the user's language when sent.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    jobId: { type: Types.ObjectId, ref: 'Job', required: true },
    /** What the texts need: job title, employer, score. */
    values: {
      title: { type: String, required: true },
      employer: { type: String, required: true },
      score: { type: Number, required: true },
    },
    /** The run that found it (scheduled or started by hand). */
    runId: { type: Types.ObjectId, ref: 'ResearchRun', default: null },
    pushSent: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, type: 1, jobId: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });

export type NotificationDocument = HydratedDocument<InferSchemaType<typeof notificationSchema>>;
export const Notification = model('Notification', notificationSchema);

export function toPublicNotification(n: NotificationDocument) {
  return {
    id: String(n._id),
    type: n.type,
    jobId: String(n.jobId),
    values: { title: n.values!.title, employer: n.values!.employer, score: n.values!.score },
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
