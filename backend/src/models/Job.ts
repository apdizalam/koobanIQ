import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { EMPLOYER_TYPES } from './JobSource.js';
import { JOB_TYPES, WORK_MODES } from './Profile.js';
import { REGION_KEYS } from './Region.js';
import { LANGUAGES } from './User.js';

/** Where a job was found: the source, its own id for the job, and its apply link. */
const jobSourceRefSchema = new Schema(
  {
    sourceKey: { type: String, required: true },
    externalId: { type: String, required: true },
    applyUrl: { type: String, required: true },
  },
  { _id: false },
);

/**
 * `jobs` collection (architecture doc §7, TIQ-16). Only jobs a selected source
 * really returned, each with a real apply link. Stored once: `hash` (title,
 * employer, region, city) removes the same job found again or on another source;
 * every source it came from is kept in `sources`. Jobs are not personal data and
 * are shared by all users; runs keep which jobs each user's search found.
 */
const jobSchema = new Schema(
  {
    hash: { type: String, required: true, unique: true },
    /** The first source it was found on (shown as "via …"). */
    sourceKey: { type: String, required: true },
    externalId: { type: String, required: true },
    applyUrl: { type: String, required: true },
    sources: { type: [jobSourceRefSchema], default: [] },
    title: { type: String, required: true },
    employer: { type: String, required: true },
    employerType: { type: String, enum: EMPLOYER_TYPES, required: true },
    region: { type: String, enum: REGION_KEYS, required: true, index: true },
    city: String,
    /** Only when the source says it. */
    jobType: { type: String, enum: JOB_TYPES },
    workMode: { type: String, enum: WORK_MODES },
    deadline: Date,
    /** When the source says it was posted (never our own discovery date). */
    postedAt: Date,
    language: { type: String, enum: LANGUAGES },
    description: String,
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true },
);

jobSchema.index({ 'sources.sourceKey': 1, 'sources.externalId': 1 });

export type JobDocument = HydratedDocument<InferSchemaType<typeof jobSchema>>;
export const Job = model('Job', jobSchema);

export function toPublicJob(job: JobDocument) {
  return {
    id: String(job._id),
    sourceKey: job.sourceKey,
    applyUrl: job.applyUrl,
    sources: job.sources.map((s) => ({ sourceKey: s.sourceKey, applyUrl: s.applyUrl })),
    title: job.title,
    employer: job.employer,
    employerType: job.employerType,
    region: job.region,
    city: job.city ?? null,
    jobType: job.jobType ?? null,
    workMode: job.workMode ?? null,
    deadline: job.deadline ?? null,
    postedAt: job.postedAt ?? null,
    language: job.language ?? null,
    description: job.description ?? null,
    firstSeenAt: job.firstSeenAt,
    lastSeenAt: job.lastSeenAt,
  };
}
