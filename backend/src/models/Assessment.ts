import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { QUIZ_DIFFICULTIES } from '../ai/schemas/quiz.js';

export const ASSESSMENT_STATUSES = ['in_progress', 'finished', 'cancelled'] as const;
export const QUIZ_LENGTHS = [5, 10] as const;

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, enum: QUIZ_DIFFICULTIES, required: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    /** Index of the correct option. Never sent to the app before the question is answered. */
    answer: { type: Number, required: true },
    explanation: { type: String, required: true },
  },
  { _id: false },
);

const askedSchema = new Schema(
  {
    questionId: { type: String, required: true },
    choice: { type: Number, required: true },
    correct: { type: Boolean, required: true },
    difficulty: { type: String, enum: QUIZ_DIFFICULTIES, required: true },
    topic: { type: String, required: true },
    answeredAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * An admin's note that a question looks wrong or unclear (TIQ-33). For
 * reviewing the AI's question quality only: the user's result is not changed.
 */
const flagSchema = new Schema(
  {
    questionId: { type: String, required: true },
    reason: { type: String, required: true },
    flaggedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flaggedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * `assessments` collection (TIQ-13): one skill quiz. The AI writes a question
 * bank once; the order of questions adapts to the answers (services/quizEngine).
 * When finished, the skill's assessedLevel and gaps are set from the result.
 */
const assessmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    skillId: { type: Schema.Types.ObjectId, ref: 'Skill', required: true },
    /** Copied so the history still reads well if the skill is renamed or deleted. */
    skillName: { type: String, required: true },
    language: { type: String, enum: ['en', 'so'], required: true },
    length: { type: Number, enum: QUIZ_LENGTHS, required: true },
    startDifficulty: { type: String, enum: QUIZ_DIFFICULTIES, required: true },
    status: { type: String, enum: ASSESSMENT_STATUSES, default: 'in_progress' },
    bank: { type: [questionSchema], required: true },
    asked: { type: [askedSchema], default: [] },
    currentQuestionId: { type: String, default: null },
    state: {
      difficulty: { type: String, enum: QUIZ_DIFFICULTIES, required: true },
      streak: { type: Number, default: 0 },
      focusTopic: { type: String, default: null },
    },
    result: { type: Schema.Types.Mixed, default: null },
    /** Questions an admin flagged as bad (TIQ-33); at most one flag per question. */
    flags: { type: [flagSchema], default: [] },
    finishedAt: Date,
  },
  { timestamps: true },
);

assessmentSchema.index({ userId: 1, createdAt: -1 });
assessmentSchema.index({ createdAt: -1 });

export type AssessmentDocument = HydratedDocument<InferSchemaType<typeof assessmentSchema>>;
export const Assessment = model('Assessment', assessmentSchema);
