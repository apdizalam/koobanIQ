import type { SkillLevel } from './skills';

/** Quiz difficulties (owner decision: Easy / Normal / Hard). */
export const QUIZ_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const QUIZ_LENGTHS = [5, 10] as const;
export type QuizLength = (typeof QUIZ_LENGTHS)[number];

/** The current question (backend services/assessmentService.ts): never the right answer. */
export interface QuizQuestion {
  id: string;
  /** 1-based position in the quiz. */
  number: number;
  total: number;
  difficulty: QuizDifficulty;
  topic: string;
  question: string;
  options: string[];
}

/** The report of a finished quiz (backend services/quizEngine.ts quizResult). */
export interface QuizResult {
  correct: number;
  total: number;
  scorePercent: number;
  level: SkillLevel;
  highestDifficulty: QuizDifficulty;
  strengths: string[];
  gaps: string[];
}

export interface Quiz {
  id: string;
  skillId: string;
  skillName: string;
  language: 'en' | 'so';
  length: QuizLength;
  startDifficulty: QuizDifficulty;
  status: 'in_progress' | 'finished' | 'cancelled';
  /** Difficulty of the next question. */
  difficulty: QuizDifficulty;
  answered: number;
  /** Left out in the history list; null when not in progress. */
  question?: QuizQuestion | null;
  result: QuizResult | null;
  createdAt: string;
  finishedAt: string | null;
}

/** What the server says after an answer (the right option and why). */
export interface QuizFeedback {
  questionId: string;
  correct: boolean;
  correctChoice: number;
  explanation: string;
}
