import { Schema, model, type InferSchemaType } from 'mongoose';

/** The AI features (one name per feature, used in usage records and limits). */
export const AI_FEATURES = [
  'jd_extraction', // TIQ-8
  'cv_generation', // TIQ-9
  'skill_quiz', // TIQ-13
  'job_match', // TIQ-17
  'interview', // TIQ-19
  'connectivity_check', // npm run ai:check / tests
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const USAGE_STATUSES = [
  'ok',
  'invalid_output', // answer was not valid JSON or did not match the schema (after the retry)
  'quota', // free-tier quota / rate limit at the provider
  'timeout',
  'auth', // provider rejected the API key
  'unavailable',
  'blocked', // provider declined the content
  'capped', // not sent: the user reached the hourly safety cap (protects the shared free quota)
] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

/**
 * `usageRecords` collection (architecture doc §7, TIQ-23; monitoring and cost
 * control only: KOBANIQ is free, with no plans or usage limits). One record per
 * AI request, also when the hourly safety cap stopped it (status `capped`).
 * Holds no prompt or answer content and no personal data besides the user id.
 */
const usageRecordSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    feature: { type: String, enum: AI_FEATURES, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    status: { type: String, enum: USAGE_STATUSES, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    /** 1, or 2 when the first answer was invalid and was retried; 0 when capped (not sent). */
    attempts: { type: Number, default: 1 },
    durationMs: Number,
    /** Our error code (e.g. AI_QUOTA_REACHED), never the provider's message. */
    errorCode: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Per-user limit check and per-user history.
usageRecordSchema.index({ userId: 1, createdAt: -1 });
usageRecordSchema.index({ feature: 1, createdAt: -1 });

export type UsageRecordFields = InferSchemaType<typeof usageRecordSchema>;
export const UsageRecord = model('UsageRecord', usageRecordSchema);
