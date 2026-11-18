import { Schema, Types, model } from 'mongoose';

export const EMAIL_CODE_PURPOSES = ['verifyEmail', 'resetPassword'] as const;
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];

/**
 * `emailCodes` collection: 6-digit codes sent by email (verify email, reset password).
 * Only a hash is stored. A newer code replaces the older one for the same purpose.
 */
const emailCodeSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: EMAIL_CODE_PURPOSES, required: true },
    codeHash: { type: String, required: true },
    /** MongoDB deletes the record automatically once this time passes (TTL index). */
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    /** Wrong guesses so far; the code stops working at the limit. */
    attempts: { type: Number, default: 0 },
    /** Set when the code is used; a code works only once. */
    consumedAt: { type: Date },
  },
  { timestamps: true },
);

emailCodeSchema.index({ userId: 1, purpose: 1, createdAt: -1 });

export const EmailCode = model('EmailCode', emailCodeSchema);
