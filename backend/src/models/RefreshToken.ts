import { Schema, Types, model } from 'mongoose';

/** `refreshTokens` collection: only a SHA-256 hash of each token is stored. */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    /** MongoDB deletes the record automatically once this time passes (TTL index). */
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date },
    /** Why it stopped working: swapped for a new pair, user logged out, or ended for safety. */
    revokedReason: { type: String, enum: ['rotated', 'logout', 'reuse'] },
    device: { type: String },
  },
  { timestamps: true },
);

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
