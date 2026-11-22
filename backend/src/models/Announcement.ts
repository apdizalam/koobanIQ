import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Who receives it: every active user, or only those whose app language is English / Somali. */
export const ANNOUNCEMENT_AUDIENCES = ['all', 'en', 'so'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** Same limits for both languages. */
export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 500;

const bilingual = { en: { type: String, required: true }, so: { type: String, required: true } };

/**
 * `announcements` collection (TIQ-33): a message an admin sent to users, written
 * in English and Somali. Each recipient gets an in-app notification (and a push
 * when they allow it) in their own app language.
 */
const announcementSchema = new Schema(
  {
    title: bilingual,
    body: bilingual,
    audience: { type: String, enum: ANNOUNCEMENT_AUDIENCES, required: true },
    /** Whether a push was sent too (only to users who allow push). */
    push: { type: Boolean, required: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    /** Users who got it in their list. */
    recipients: { type: Number, default: 0 },
    /** Of those, users whose phones were sent the push. */
    pushed: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

announcementSchema.index({ createdAt: -1 });

export type AnnouncementDocument = HydratedDocument<InferSchemaType<typeof announcementSchema>>;
export const Announcement = model('Announcement', announcementSchema);
