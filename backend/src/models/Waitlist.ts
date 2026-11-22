import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * `waitlist` collection (TIQ-34): people who asked on the landing page to hear
 * when the app is out. Only what is needed: email (once), optional name, the
 * page language and when they agreed to the privacy policy. No IP address.
 */
const waitlistSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    language: { type: String, enum: ['en', 'so'], required: true },
    consentAt: { type: Date, required: true },
    source: { type: String, default: 'landing' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'waitlist' },
);

export type WaitlistFields = InferSchemaType<typeof waitlistSchema>;
export const Waitlist = model('Waitlist', waitlistSchema);
