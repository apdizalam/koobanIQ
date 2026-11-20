import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CAREER_LEVELS } from '../jobs/match/signals.js';
import { MATCH_CATEGORIES } from '../jobs/match/score.js';

const reasonSchema = new Schema(
  { key: { type: String, required: true }, values: { type: Schema.Types.Mixed } },
  { _id: false },
);

/**
 * `jobMatches` collection (TIQ-17): how one stored job fits one user, with its
 * full explanation (category, matched skills, missing required / preferred
 * skills, career-level fit, reasons). Personal: only the user sees it, and it
 * is deleted with the account. Recomputed whenever the user searches, so it
 * follows the latest profile and quiz results.
 */
const jobMatchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    category: { type: String, enum: MATCH_CATEGORIES, required: true },
    recommended: { type: Boolean, required: true },
    matchedSkills: { type: [String], required: true },
    missingRequired: { type: [String], required: true },
    missingPreferred: { type: [String], required: true },
    /** Null when the profile gives no evidence (never invented). */
    userLevel: { type: String, enum: CAREER_LEVELS, default: null },
    levelConfidence: {
      type: String,
      enum: ['confident', 'estimated', 'unknown'],
      required: true,
    },
    relevantYears: { type: Number, required: true },
    requiredYears: { type: Number, default: null },
    jobLevel: { type: String, enum: CAREER_LEVELS, default: null },
    levelFit: {
      type: String,
      enum: ['fits', 'stretch', 'above', 'below', 'unknown'],
      required: true,
    },
    reasons: { type: [reasonSchema], required: true },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

jobMatchSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export type JobMatchDocument = HydratedDocument<InferSchemaType<typeof jobMatchSchema>>;
export const JobMatch = model('JobMatch', jobMatchSchema);
