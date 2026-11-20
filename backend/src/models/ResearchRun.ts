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
    /** Of the valid ones: stored for the first time. */
    new: { type: Number, default: 0 },
    /** Of the valid ones: already stored (same job again, or found on another source). */
    duplicates: { type: Number, default: 0 },
    /** Tries (1 + retries after a failure). */
    attempts: { type: Number, default: 0 },
    error: { type: String },
    durationMs: { type: Number },
  },
  { _id: false },
);

/**
 * `researchRuns` collection (architecture doc §7, TIQ-16). Runs in the
 * background; per source it records what was searched, found, new, duplicate,
 * invalid and any error. `jobIds` are the stored jobs this run found, ranked.
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
    /** Career-page links the user gave for this run. */
    customUrls: { type: [String], default: [] },
    perSource: { type: [perSourceSchema], default: [] },
    /** Valid jobs found across all sources (each job once). */
    jobsFound: { type: Number, default: 0 },
    jobsNew: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    /** The jobs found, ranked: the selected regions first, then remote, then the rest. */
    jobIds: { type: [{ type: Types.ObjectId, ref: 'Job' }], default: [] },
    /** Why the whole run failed (e.g. the server restarted during it). */
    error: { type: String },
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
    customUrls: run.customUrls,
    perSource: run.perSource.map((p) => ({
      key: p.key,
      queried: p.queried,
      found: p.found,
      invalid: p.invalid,
      new: p.new,
      duplicates: p.duplicates,
      attempts: p.attempts,
      error: p.error ?? null,
      durationMs: p.durationMs ?? null,
    })),
    jobsFound: run.jobsFound,
    jobsNew: run.jobsNew,
    duplicates: run.duplicates,
    error: run.error ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };
}
