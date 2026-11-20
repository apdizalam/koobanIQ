import type { Quiz, QuizDifficulty, QuizFeedback, QuizLength } from '../types/quiz';
import { AI_REQUEST_TIMEOUT_MS, apiRequest } from './api';

const quiz = (id: string) => `/assessments/${encodeURIComponent(id)}`;

/**
 * POST /assessments (TIQ-13/14): the AI writes the questions for one of the
 * user's skills (only the skill name is sent). Can take up to a minute.
 */
export const startQuiz = (
  accessToken: string,
  input: { skillId: string; difficulty: QuizDifficulty; language: 'en' | 'so'; length: QuizLength },
) =>
  apiRequest<{ assessment: Quiz }>('/assessments', {
    method: 'POST',
    accessToken,
    body: input,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

/** POST /assessments/:id/answers: feedback, and the next question or the report. */
export const answerQuiz = (accessToken: string, id: string, questionId: string, choice: number) =>
  apiRequest<{ feedback: QuizFeedback; assessment: Quiz }>(`${quiz(id)}/answers`, {
    method: 'POST',
    accessToken,
    body: { questionId, choice },
  });

/** GET /assessments: history, newest first. */
export const fetchQuizzes = (accessToken: string) =>
  apiRequest<{ assessments: Quiz[] }>('/assessments', { accessToken });

/** GET /assessments/:id: resume (current question) or the report. */
export const fetchQuiz = (accessToken: string, id: string) =>
  apiRequest<{ assessment: Quiz }>(quiz(id), { accessToken });

/** POST /assessments/:id/cancel: leave the quiz for good; the skill does not change. */
export const cancelQuiz = (accessToken: string, id: string) =>
  apiRequest<{ assessment: Quiz }>(`${quiz(id)}/cancel`, { method: 'POST', accessToken });

/** "A", "B", "C", "D" for the answer options (design 08). */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);
