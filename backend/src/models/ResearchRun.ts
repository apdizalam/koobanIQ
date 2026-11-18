import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { EMPLOYER_TYPES } from './JobSource.js';
import { REGION_KEYS } from './Region.js';

export const RUN_STATUSES = ['running', 'completed', 'partial', 'failed'] as const;

/** What happened with one source in a run: it proves exactly what was searched. */
const perSourceSchema = new Schema(
  {
    key: { type: String, required: true },
    /** True only for sources the user selected and that were actually searched. */
    queried: { type: Boolean, required: true },
    /** Jobs the source returned. */
    found: { type: Number, default: 0 },
    /** Of those, dropped for missing region, employer or a real apply link. */
    invalid: { type: Number, default: 0 },
    error: { type: String },
    durationMs: { type: Number },
  },
  { _id: false },
);

/**
 * `researchRuns` collection (architecture doc §7). Storing jobs, duplicates
 * and matches per run come with the research worker (TIQ-16).
 */
const researchRunSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: RUN_STATUSES, required: true, index: true },
    sourceKeys: { type: [String], required: true },
    regions: { type: [{ type: String, enum: REGION_KEYS }], required: true },
    filters: {
      titles: { type: [String], default: [] },
      skills: { type: [String], default: [] },
      city: { type: String },
      employerTypes: { type: [{ type: String, enum: EMPLOYER_TYPES }], default: [] },
    },
    perSource: { type: [perSourceSchema], default: [] },
    /** Valid jobs found across all sources. */
    jobsFound: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

researchRunSchema.index({ userId: 1, createdAt: -1 });

export type ResearchRunDocument = HydratedDocument<InferSchemaType<typeof researchRunSchema>>;
export const ResearchRun = model('ResearchRun', researchRunSchema);

export function toPublicRun(run: ResearchRunDocument) {
  return {
    id: run.id as string,
    status: run.status,
    sourceKeys: run.sourceKeys,
    regions: run.regions,
    filters: run.filters,
    perSource: run.perSource.map((p) => ({
      key: p.key,
      queried: p.queried,
      found: p.found,
      invalid: p.invalid,
      error: p.error ?? null,
      durationMs: p.durationMs ?? null,
    })),
    jobsFound: run.jobsFound,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };
}
