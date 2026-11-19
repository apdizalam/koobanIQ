import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** One missing item ({ type: "requiredSkill", item: "SQL" }). "$type" so the field can be called "type". */
const missingInfoSchema = new Schema(
  { type: { $type: String, required: true }, item: { $type: String } },
  { _id: false, typeKey: '$type' },
);

/**
 * `cvs` collection (architecture doc §7, TIQ-9). Each generation is a new
 * version for one job description and one CV language. `content` is the
 * finished CV as shown to the user (facts from the profile at that time, AI
 * wording); it stays as generated even if the profile changes later.
 * TIQ-10: draft → approved (user approves) → exported (first PDF download).
 * Only the wording may be edited; editing an approved or exported CV makes a
 * new draft version and keeps the approved one.
 */
const cvSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobDescriptionId: { type: Schema.Types.ObjectId, ref: 'JobDescription', required: true },
    /** Chosen by the user for every generation; never copied from the app language. */
    language: { type: String, enum: ['en', 'so'], required: true },
    /** 1, 2, ... per job description and language. */
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'approved', 'exported'], default: 'draft' },
    template: { type: String, default: 'classic' },
    content: { type: Schema.Types.Mixed, required: true },
    missingInfo: { type: [missingInfoSchema], default: [] },
    approvedAt: { type: Date },
    /** First PDF download. */
    exportedAt: { type: Date },
    /** The version this one was edited from (wording changes on an approved CV). */
    editedFromId: { type: Schema.Types.ObjectId, ref: 'Cv' },
  },
  { timestamps: true },
);

cvSchema.index({ userId: 1, createdAt: -1 });
cvSchema.index({ userId: 1, jobDescriptionId: 1, language: 1, version: 1 }, { unique: true });

export type CvDocument = HydratedDocument<InferSchemaType<typeof cvSchema>>;
export const Cv = model('Cv', cvSchema);

export function toPublicCv(cv: CvDocument, withContent = true) {
  return {
    id: String(cv._id),
    jobDescriptionId: String(cv.jobDescriptionId),
    language: cv.language,
    version: cv.version,
    status: cv.status,
    template: cv.template,
    approvedAt: cv.approvedAt ?? null,
    exportedAt: cv.exportedAt ?? null,
    missingInfo: cv.missingInfo.map((m) => ({ type: m.type, ...(m.item ? { item: m.item } : {}) })),
    ...(withContent ? { content: cv.content } : {}),
    createdAt: cv.createdAt,
  };
}
