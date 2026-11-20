import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** `savedJobs` collection (TIQ-18): jobs a user keeps for later. Personal; deleted with the account. */
const savedJobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  },
  { timestamps: true },
);

savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
savedJobSchema.index({ userId: 1, createdAt: -1 });

export type SavedJobDocument = HydratedDocument<InferSchemaType<typeof savedJobSchema>>;
export const SavedJob = model('SavedJob', savedJobSchema);
