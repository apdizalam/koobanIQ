import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { JD_JOB_TYPES } from '../ai/schemas/jobDescription.js';

const extractedSchema = new Schema(
  {
    language: { type: String, enum: ['en', 'so', 'other'] },
    title: String,
    company: String,
    location: String,
    jobType: { type: String, enum: JD_JOB_TYPES },
    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },
    education: { type: [String], default: [] },
    experience: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    qualifications: { type: [String], default: [] },
    /** YYYY-MM-DD, only when the ad states a date. */
    deadline: String,
    keywords: { type: [String], default: [] },
  },
  { _id: false },
);

/**
 * `jobDescriptions` collection (architecture doc §7, TIQ-8): a job ad the user
 * pasted or uploaded and what the AI extracted from it. Pasted text is kept
 * (for CVs and matching later); an uploaded PDF is not stored, only its name.
 */
const jobDescriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['text', 'pdf'], required: true },
    /** SHA-256 of the text or file: the same ad twice reuses the first result (saves AI quota). */
    hash: { type: String, required: true },
    rawText: String,
    fileName: String,
    extracted: { type: extractedSchema, required: true },
    /** Skills the AI named that do not appear in the pasted text (removed, never shown). */
    droppedSkills: { type: Number, default: 0 },
  },
  { timestamps: true },
);

jobDescriptionSchema.index({ userId: 1, hash: 1 }, { unique: true });
jobDescriptionSchema.index({ userId: 1, createdAt: -1 });

export type JobDescriptionDocument = HydratedDocument<InferSchemaType<typeof jobDescriptionSchema>>;
export const JobDescription = model('JobDescription', jobDescriptionSchema);

export function toPublicJobDescription(jd: JobDescriptionDocument, withText = false) {
  const e = jd.extracted;
  return {
    id: String(jd._id),
    source: jd.source,
    fileName: jd.fileName ?? null,
    ...(withText ? { text: jd.rawText ?? null } : {}),
    extracted: {
      language: e.language ?? 'other',
      title: e.title ?? null,
      company: e.company ?? null,
      location: e.location ?? null,
      jobType: e.jobType ?? null,
      requiredSkills: e.requiredSkills,
      preferredSkills: e.preferredSkills,
      education: e.education,
      experience: e.experience,
      responsibilities: e.responsibilities,
      qualifications: e.qualifications,
      deadline: e.deadline ?? null,
      keywords: e.keywords,
    },
    createdAt: jd.createdAt,
  };
}
