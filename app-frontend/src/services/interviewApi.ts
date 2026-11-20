import type {
  Interview,
  InterviewFeedback,
  InterviewLength,
  InterviewType,
} from '../types/interview';
import { AI_REQUEST_TIMEOUT_MS, apiRequest } from './api';

const one = (id: string) => `/interviews/${encodeURIComponent(id)}`;

export interface InterviewStartInput {
  type: InterviewType;
  /** Job title (not needed when practising for a saved job ad or a found job). */
  role?: string;
  jobDescriptionId?: string;
  jobId?: string;
  language: 'en' | 'so';
  length: InterviewLength;
}

/**
 * POST /interviews (TIQ-19): the AI writes the questions. Only the practice
 * type and the job's title / facts are sent. Can take up to a minute.
 */
export const startInterview = (accessToken: string, input: InterviewStartInput) =>
  apiRequest<{ interview: Interview }>('/interviews', {
    method: 'POST',
    accessToken,
    body: input,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

/** POST /interviews/:id/answers: AI feedback on the typed answer. */
export const answerInterview = (
  accessToken: string,
  id: string,
  questionId: string,
  answer: string,
) =>
  apiRequest<{ feedback: InterviewFeedback & { questionId: string }; interview: Interview }>(
    `${one(id)}/answers`,
    { method: 'POST', accessToken, body: { questionId, answer }, timeoutMs: AI_REQUEST_TIMEOUT_MS },
  );

/** GET /interviews: history, newest first. */
export const fetchInterviews = (accessToken: string) =>
  apiRequest<{ interviews: Interview[] }>('/interviews', { accessToken });

/** GET /interviews/:id: resume, or the transcript and summary. */
export const fetchInterview = (accessToken: string, id: string) =>
  apiRequest<{ interview: Interview }>(one(id), { accessToken });

export const cancelInterview = (accessToken: string, id: string) =>
  apiRequest<{ interview: Interview }>(`${one(id)}/cancel`, { method: 'POST', accessToken });

export const deleteInterview = (accessToken: string, id: string) =>
  apiRequest<void>(one(id), { method: 'DELETE', accessToken });
