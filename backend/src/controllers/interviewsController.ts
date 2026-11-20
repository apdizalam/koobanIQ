import type { Request, Response } from 'express';
import {
  INTERVIEW_LENGTHS,
  INTERVIEW_TYPES,
  type InterviewLength,
  type InterviewType,
} from '../ai/schemas/interview.js';
import { AppError } from '../lib/errors.js';
import {
  answerInterview,
  cancelInterview,
  deleteInterview,
  getInterview,
  listInterviews,
  startInterview,
} from '../services/interviewService.js';

type Body = Record<string, unknown>;
const bodyOf = (body: unknown): Body => (body && typeof body === 'object' ? (body as Body) : {});

/** Longest typed answer (a long spoken answer is about 400 words). */
export const MAX_ANSWER_LENGTH = 3000;
const MAX_ROLE_LENGTH = 100;

function fail(details: Record<string, string>) {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
}

function onlyKeys(b: Body, allowed: string[], details: Record<string, string>) {
  for (const key of Object.keys(b)) if (!allowed.includes(key)) details[key] = 'fieldNotEditable';
}

/** Body of POST /interviews. */
function parseStart(body: unknown) {
  const b = bodyOf(body);
  const details: Record<string, string> = {};
  onlyKeys(b, ['type', 'role', 'jobDescriptionId', 'jobId', 'language', 'length'], details);
  if (!(INTERVIEW_TYPES as readonly unknown[]).includes(b.type)) {
    details.type = 'interviewTypeInvalid';
  }
  const role = typeof b.role === 'string' ? b.role.trim() : '';
  if (b.role !== undefined && typeof b.role !== 'string') details.role = 'required';
  if (role.length > MAX_ROLE_LENGTH) details.role = 'textTooLong';
  for (const key of ['jobDescriptionId', 'jobId'] as const) {
    if (b[key] !== undefined && (typeof b[key] !== 'string' || !b[key])) details[key] = 'required';
  }
  if (b.jobDescriptionId && b.jobId) details.jobId = 'interviewOneJob';
  if (b.type === 'job_specific' && !b.jobDescriptionId && !b.jobId) {
    details.jobDescriptionId = 'interviewJobRequired';
  } else if (b.type !== 'job_specific' && !role && !b.jobDescriptionId && !b.jobId) {
    details.role = 'required';
  }
  if (b.language !== 'en' && b.language !== 'so') details.language = 'quizLanguageRequired';
  if (b.length !== undefined && !(INTERVIEW_LENGTHS as readonly unknown[]).includes(b.length)) {
    details.length = 'interviewLengthInvalid';
  }
  fail(details);
  return {
    type: b.type as InterviewType,
    role: role || undefined,
    jobDescriptionId: (b.jobDescriptionId as string | undefined) || undefined,
    jobId: (b.jobId as string | undefined) || undefined,
    language: b.language as 'en' | 'so',
    length: (b.length ?? 5) as InterviewLength,
  };
}

/** Body of POST /interviews/:id/answers. */
function parseAnswer(body: unknown) {
  const b = bodyOf(body);
  const details: Record<string, string> = {};
  onlyKeys(b, ['questionId', 'answer'], details);
  if (typeof b.questionId !== 'string' || !b.questionId) details.questionId = 'required';
  const answer = typeof b.answer === 'string' ? b.answer.trim() : '';
  if (!answer) details.answer = 'required';
  else if (answer.length > MAX_ANSWER_LENGTH) details.answer = 'textTooLong';
  fail(details);
  return { questionId: b.questionId as string, answer };
}

/** POST /api/v1/interviews { type, role?, jobDescriptionId?, jobId?, language, length? } */
export async function postInterview(req: Request, res: Response) {
  const interview = await startInterview(req.user!._id, parseStart(req.body));
  res.status(201).json({ data: { interview }, error: null, meta: {} });
}

/** POST /api/v1/interviews/:id/answers { questionId, answer } */
export async function postInterviewAnswer(req: Request, res: Response) {
  const data = await answerInterview(req.user!._id, req.params.id, parseAnswer(req.body));
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/interviews (history) */
export async function getInterviews(req: Request, res: Response) {
  res.json({ data: { interviews: await listInterviews(req.user!._id) }, error: null, meta: {} });
}

/** GET /api/v1/interviews/:id (resume, or transcript + summary) */
export async function getOneInterview(req: Request, res: Response) {
  res.json({
    data: { interview: await getInterview(req.user!._id, req.params.id) },
    error: null,
    meta: {},
  });
}

/** POST /api/v1/interviews/:id/cancel */
export async function postInterviewCancel(req: Request, res: Response) {
  res.json({
    data: { interview: await cancelInterview(req.user!._id, req.params.id) },
    error: null,
    meta: {},
  });
}

/** DELETE /api/v1/interviews/:id */
export async function removeInterview(req: Request, res: Response) {
  await deleteInterview(req.user!._id, req.params.id);
  res.status(204).end();
}
