import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { INTERVIEW_LENGTHS, INTERVIEW_TYPES } from '../ai/schemas/interview.js';

export const INTERVIEW_STATUSES = ['in_progress', 'finished', 'cancelled'] as const;

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    question: { type: String, required: true },
    focus: { type: String, required: true },
  },
  { _id: false },
);

const feedbackSchema = new Schema(
  {
    score: { type: Number, required: true },
    summary: { type: String, required: true },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    betterAnswer: { type: String, required: true },
  },
  { _id: false },
);

const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    /** What the user typed (the transcript). */
    answer: { type: String, required: true },
    feedback: { type: feedbackSchema, required: true },
    answeredAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * `interviews` collection (TIQ-19): one text interview practice session.
 * The AI writes the questions once; each typed answer gets AI feedback.
 * Questions, answers and feedback are kept as the session's transcript.
 */
const interviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: INTERVIEW_TYPES, required: true },
    /** Job title practised for (typed, or from the job ad / stored job). */
    role: { type: String, required: true },
    employer: { type: String, default: null },
    skills: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    /** job_specific: the saved job ad or stored job it is based on. */
    jobDescriptionId: { type: Schema.Types.ObjectId, ref: 'JobDescription', default: null },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    language: { type: String, enum: ['en', 'so'], required: true },
    length: { type: Number, enum: INTERVIEW_LENGTHS, required: true },
    status: { type: String, enum: INTERVIEW_STATUSES, default: 'in_progress' },
    questions: { type: [questionSchema], required: true },
    answers: { type: [answerSchema], default: [] },
    finishedAt: Date,
  },
  { timestamps: true },
);

interviewSchema.index({ userId: 1, createdAt: -1 });

export type InterviewDocument = HydratedDocument<InferSchemaType<typeof interviewSchema>>;
export const Interview = model('Interview', interviewSchema);
