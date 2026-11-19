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
 * Approval and PDF export come with TIQ-10.
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
    missingInfo: cv.missingInfo.map((m) => ({ type: m.type, ...(m.item ? { item: m.item } : {}) })),
    ...(withContent ? { content: cv.content } : {}),
    createdAt: cv.createdAt,
  };
}
