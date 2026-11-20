import { z } from 'zod';

/** Interview practice types (TIQ-19). */
export const INTERVIEW_TYPES = [
  'general',
  'technical',
  'behavioral',
  'job_specific',
  'problem_solving',
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

/** Questions per session (End Test: 5 by default). */
export const INTERVIEW_LENGTHS = [3, 5, 10] as const;
export type InterviewLength = (typeof INTERVIEW_LENGTHS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * The AI's questions for one session. Asked for exactly as many as needed;
 * checked: no question twice.
 */
export const interviewQuestionsSchema = (count: number) =>
  z
    .object({
      questions: z
        .array(
          z
            .object({
              question: text(400),
              /** What a good answer shows, e.g. "Teamwork", "SQL joins" (for the user). */
              focus: text(80),
            })
            .strict(),
        )
        .length(count),
    })
    .strict()
    .superRefine((value, ctx) => {
      const seen = new Set(value.questions.map((q) => q.question.trim().toLowerCase()));
      if (seen.size !== value.questions.length) {
        ctx.addIssue({ code: 'custom', path: ['questions'], message: 'same question twice' });
      }
    });

export type InterviewQuestions = z.infer<ReturnType<typeof interviewQuestionsSchema>>;

/**
 * Feedback on one answer. Score 0–10 (how well the answer would work in a
 * real interview, not a judgement of the person).
 */
export const interviewFeedbackSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    summary: text(400),
    strengths: z.array(text(200)).max(3),
    improvements: z.array(text(200)).max(3),
    /** A short outline of a stronger answer (no invented facts about the user). */
    betterAnswer: text(800),
  })
  .strict();

export type InterviewFeedback = z.infer<typeof interviewFeedbackSchema>;
