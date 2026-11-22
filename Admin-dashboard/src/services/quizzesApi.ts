import type { AuthState } from '../auth/authContext';

type Request = AuthState['request'];

/** Backend services/adminAssessmentService.ts (TIQ-33). */
export const QUIZ_STATUSES = ['in_progress', 'finished', 'cancelled'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];
export type SkillLevel = 'beginner' | 'mid' | 'advanced' | 'expert';
export type Difficulty = 'easy' | 'normal' | 'hard';

export const isQuizStatus = (v: unknown): v is QuizStatus =>
  typeof v === 'string' && (QUIZ_STATUSES as readonly string[]).includes(v);

/** Same limit as the backend. */
export const FLAG_REASON_MAX = 300;
export const QUIZZES_PAGE_SIZE = 25;

export interface QuizRow {
  id: string;
  userId: string;
  email: string | null;
  skillName: string;
  language: 'en' | 'so';
  length: number;
  status: QuizStatus;
  answered: number;
  scorePercent: number | null;
  level: SkillLevel | null;
  flags: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface QuizPage {
  summary: { finished: number; inProgress: number; cancelled: number; flaggedQuestions: number };
  items: QuizRow[];
  total: number;
  page: number;
  limit: number;
}

export interface QuizQuestion {
  number: number;
  id: string;
  topic: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number | null;
  choice: number;
  correct: boolean;
  explanation: string;
  flag: { reason: string; by: string | null; at: string } | null;
}

export interface QuizDetail {
  id: string;
  userId: string;
  email: string | null;
  skillName: string;
  language: 'en' | 'so';
  length: number;
  status: QuizStatus;
  result: {
    correct: number;
    total: number;
    scorePercent: number;
    level: SkillLevel;
    strengths: string[];
    gaps: string[];
  } | null;
  createdAt: string;
  finishedAt: string | null;
  questions: QuizQuestion[];
}

export const fetchQuizzes = (
  request: Request,
  filters: { status: '' | QuizStatus; skill: string; page: number },
) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.skill.trim()) params.set('skill', filters.skill.trim());
  params.set('page', String(filters.page));
  params.set('limit', String(QUIZZES_PAGE_SIZE));
  return request<QuizPage>(`/admin/assessments?${params.toString()}`);
};

export const fetchQuiz = async (request: Request, id: string) =>
  (await request<{ assessment: QuizDetail }>(`/admin/assessments/${encodeURIComponent(id)}`))
    .assessment;

const flagPath = (id: string, questionId: string) =>
  `/admin/assessments/${encodeURIComponent(id)}/questions/${encodeURIComponent(questionId)}/flag`;

export const flagQuestion = async (
  request: Request,
  id: string,
  questionId: string,
  reason: string,
) =>
  (
    await request<{ assessment: QuizDetail }>(flagPath(id, questionId), {
      method: 'POST',
      body: { reason: reason.trim() },
    })
  ).assessment;

export const unflagQuestion = async (request: Request, id: string, questionId: string) =>
  (await request<{ assessment: QuizDetail }>(flagPath(id, questionId), { method: 'DELETE' }))
    .assessment;

/** A flag reason the server accepts: not empty, at most 300 characters. */
export const validReason = (reason: string) =>
  reason.trim().length > 0 && reason.trim().length <= FLAG_REASON_MAX;

/** "A".."D" for an option index (as the app shows answers). */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);
