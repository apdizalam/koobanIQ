/** Interview practice (TIQ-19), as the API returns it (backend services/interviewService.ts). */

export const INTERVIEW_TYPES = [
  'general',
  'technical',
  'behavioral',
  'job_specific',
  'problem_solving',
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_LENGTHS = [3, 5, 10] as const;
export type InterviewLength = (typeof INTERVIEW_LENGTHS)[number];

/** Longest typed answer the server takes. */
export const MAX_ANSWER_LENGTH = 3000;

export interface InterviewFeedback {
  /** 0–10: how well the answer would work in a real interview (not a judgement of the person). */
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  /** Outline of a stronger answer (placeholders, never invented facts). */
  betterAnswer: string;
}

export interface InterviewQuestion {
  id: string;
  number: number;
  total: number;
  question: string;
  focus: string;
}

export interface TranscriptEntry {
  questionId: string;
  number: number;
  question: string;
  focus: string;
  answer: string;
  feedback: InterviewFeedback;
  answeredAt: string;
}

export interface Interview {
  id: string;
  type: InterviewType;
  role: string;
  employer: string | null;
  jobDescriptionId: string | null;
  jobId: string | null;
  language: 'en' | 'so';
  length: InterviewLength;
  status: 'in_progress' | 'finished' | 'cancelled';
  answered: number;
  /** The question to answer now (null when finished or cancelled). */
  question: InterviewQuestion | null;
  summary: { averageScore: number; answered: number; best: string; weakest: string } | null;
  /** Answered questions with answers and feedback (left out in the history list). */
  transcript?: TranscriptEntry[];
  createdAt: string;
  finishedAt: string | null;
}
