import { z } from 'zod';

/** Quiz difficulties (owner decision: Easy / Normal / Hard). */
export const QUIZ_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

/** Questions per difficulty in one bank; 3 × 5 = 15 covers a 10-question quiz. */
export const BANK_PER_DIFFICULTY = 5;
export const OPTIONS_PER_QUESTION = 4;

const text = (max: number) => z.string().trim().min(1).max(max);

const questionSchema = z
  .object({
    /** Short sub-topic of the skill, e.g. "Formulas"; the same names are reused across difficulties. */
    topic: text(60),
    difficulty: z.enum(QUIZ_DIFFICULTIES),
    question: text(400),
    options: z.array(text(200)).length(OPTIONS_PER_QUESTION),
    /** Index of the one correct option (0–3). */
    answer: z
      .number()
      .int()
      .min(0)
      .max(OPTIONS_PER_QUESTION - 1),
    /** Why the correct option is right (shown after answering). */
    explanation: text(400),
  })
  .strict();

/**
 * The AI's question bank for one skill (TIQ-13; owner decision: multiple choice
 * only). Strict, and checked beyond the shape: exactly 5 questions per
 * difficulty, 4 different options each, and at least 3 topics.
 */
export const quizBankSchema = z
  .object({ questions: z.array(questionSchema).length(BANK_PER_DIFFICULTY * 3) })
  .strict()
  .superRefine((bank, ctx) => {
    for (const level of QUIZ_DIFFICULTIES) {
      const count = bank.questions.filter((q) => q.difficulty === level).length;
      if (count !== BANK_PER_DIFFICULTY) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions'],
          message: `${count} ${level} questions, expected ${BANK_PER_DIFFICULTY}`,
        });
      }
    }
    bank.questions.forEach((q, i) => {
      const seen = new Set(q.options.map((o) => o.trim().toLowerCase()));
      if (seen.size !== q.options.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', i, 'options'],
          message: 'same option twice',
        });
      }
    });
    const topics = new Set(bank.questions.map((q) => q.topic.trim().toLowerCase()));
    if (topics.size < 3) {
      ctx.addIssue({ code: 'custom', path: ['questions'], message: 'fewer than 3 topics' });
    }
  });

export type QuizBank = z.infer<typeof quizBankSchema>;
export type QuizBankQuestion = QuizBank['questions'][number];
