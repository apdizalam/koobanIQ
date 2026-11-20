import { randomInt } from 'node:crypto';
import {
  QUIZ_DIFFICULTIES,
  type QuizBankQuestion,
  type QuizDifficulty,
} from '../ai/schemas/quiz.js';
import type { SkillLevel } from '../models/Skill.js';

/**
 * The adaptive quiz (TIQ-13), decided by code from one stored question bank
 * (no AI request per question, which protects the free quota):
 * - 3 correct answers in a row → the next questions are one difficulty higher;
 * - a wrong answer → the next question is on the same topic (one step easier
 *   when there is one), to probe the gap;
 * - the result level and the gaps come from the answers, never from the AI.
 */

export interface BankQuestion extends QuizBankQuestion {
  id: string;
}

export interface AskedQuestion {
  questionId: string;
  choice: number;
  correct: boolean;
  difficulty: QuizDifficulty;
  topic: string;
}

export interface QuizState {
  /** Difficulty of the next question. */
  difficulty: QuizDifficulty;
  /** Correct answers in a row at this difficulty. */
  streak: number;
  /** Topic of the last wrong answer, asked again next. */
  focusTopic: string | null;
}

/** Correct answers in a row before the difficulty goes up. */
export const STREAK_TO_LEVEL_UP = 3;

const rank = (d: QuizDifficulty) => QUIZ_DIFFICULTIES.indexOf(d);
const sameTopic = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Shuffles each question's options (the AI tends to put the right one first) and gives ids. */
export function prepareBank(questions: QuizBankQuestion[]): BankQuestion[] {
  return questions.map((q, index) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      ...q,
      id: `q${index + 1}`,
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answer),
    };
  });
}

/** The next question for this state, or null when the bank has none left. */
export function pickNext(
  bank: BankQuestion[],
  asked: AskedQuestion[],
  state: QuizState,
): BankQuestion | null {
  const used = new Set(asked.map((a) => a.questionId));
  const free = bank.filter((q) => !used.has(q.id));
  if (free.length === 0) return null;
  const at = (d: QuizDifficulty) => free.filter((q) => q.difficulty === d);

  if (state.focusTopic) {
    const topic = free.filter((q) => sameTopic(q.topic, state.focusTopic!));
    const easier = QUIZ_DIFFICULTIES[Math.max(0, rank(state.difficulty) - 1)];
    const found =
      topic.find((q) => q.difficulty === easier) ??
      topic.find((q) => q.difficulty === state.difficulty) ??
      topic[0];
    if (found) return found;
  }

  const askedTopics = new Set(asked.map((a) => a.topic.trim().toLowerCase()));
  const here = at(state.difficulty);
  const fresh = here.find((q) => !askedTopics.has(q.topic.trim().toLowerCase()));
  if (fresh ?? here[0]) return fresh ?? here[0];

  // Nothing left at this difficulty: the nearest one (easier first).
  const byDistance = [...free].sort(
    (a, b) =>
      Math.abs(rank(a.difficulty) - rank(state.difficulty)) -
        Math.abs(rank(b.difficulty) - rank(state.difficulty)) ||
      rank(a.difficulty) - rank(b.difficulty),
  );
  return byDistance[0];
}

/** The state after one answer. */
export function afterAnswer(state: QuizState, question: BankQuestion, correct: boolean): QuizState {
  if (!correct) return { difficulty: state.difficulty, streak: 0, focusTopic: question.topic };
  const streak = state.streak + 1;
  if (streak >= STREAK_TO_LEVEL_UP && state.difficulty !== 'hard') {
    return {
      difficulty: QUIZ_DIFFICULTIES[rank(state.difficulty) + 1],
      streak: 0,
      focusTopic: null,
    };
  }
  return { difficulty: state.difficulty, streak, focusTopic: null };
}

const WEIGHT: Record<QuizDifficulty, number> = { easy: 1, normal: 2, hard: 3 };

/**
 * The report: score, level, strengths and gaps by topic. The level weighs the
 * difficulty of the questions answered correctly (easy 1, normal 2, hard 3, out
 * of 3 per question): ≥ 75 % expert, ≥ 50 % advanced, ≥ 25 % mid, else beginner.
 * It measures knowledge, not experience.
 */
export function quizResult(asked: AskedQuestion[]) {
  const total = asked.length;
  const correct = asked.filter((a) => a.correct).length;
  const points = asked.filter((a) => a.correct).reduce((sum, a) => sum + WEIGHT[a.difficulty], 0);
  const maxPoints = total * WEIGHT.hard;
  const ratio = maxPoints === 0 ? 0 : points / maxPoints;
  const level: SkillLevel =
    ratio >= 0.75 ? 'expert' : ratio >= 0.5 ? 'advanced' : ratio >= 0.25 ? 'mid' : 'beginner';

  const topics: string[] = [];
  for (const a of asked) if (!topics.some((t) => sameTopic(t, a.topic))) topics.push(a.topic);
  const missed = (topic: string) => asked.some((a) => sameTopic(a.topic, topic) && !a.correct);
  return {
    correct,
    total,
    scorePercent: total === 0 ? 0 : Math.round((correct / total) * 100),
    points,
    maxPoints,
    level,
    highestDifficulty: asked.reduce<QuizDifficulty>(
      (best, a) => (a.correct && rank(a.difficulty) > rank(best) ? a.difficulty : best),
      'easy',
    ),
    strengths: topics.filter((t) => !missed(t)),
    gaps: topics.filter(missed),
  };
}

export type QuizResult = ReturnType<typeof quizResult>;
