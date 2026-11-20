import type { Request, Response } from 'express';
import { QUIZ_DIFFICULTIES, type QuizDifficulty } from '../ai/schemas/quiz.js';
import { AppError } from '../lib/errors.js';
import { QUIZ_LENGTHS } from '../models/Assessment.js';
import {
  answerQuestion,
  cancelAssessment,
  getAssessment,
  listAssessments,
  startAssessment,
} from '../services/assessmentService.js';

type Body = Record<string, unknown>;
const bodyOf = (body: unknown): Body => (body && typeof body === 'object' ? (body as Body) : {});

function fail(details: Record<string, string>) {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
}

/** Body of POST /assessments. The quiz language is chosen each time (en or so). */
function parseStart(body: unknown) {
  const b = bodyOf(body);
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (!['skillId', 'difficulty', 'language', 'length'].includes(key)) {
      details[key] = 'fieldNotEditable';
    }
  }
  if (typeof b.skillId !== 'string' || !b.skillId) details.skillId = 'required';
  if (!(QUIZ_DIFFICULTIES as readonly unknown[]).includes(b.difficulty)) {
    details.difficulty = 'difficultyInvalid';
  }
  if (b.language !== 'en' && b.language !== 'so') details.language = 'quizLanguageRequired';
  if (b.length !== undefined && !(QUIZ_LENGTHS as readonly unknown[]).includes(b.length)) {
    details.length = 'quizLengthInvalid';
  }
  fail(details);
  return {
    skillId: b.skillId as string,
    difficulty: b.difficulty as QuizDifficulty,
    language: b.language as 'en' | 'so',
    length: (b.length ?? 5) as 5 | 10,
  };
}

/** Body of POST /assessments/:id/answers. */
function parseAnswer(body: unknown) {
  const b = bodyOf(body);
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (key !== 'questionId' && key !== 'choice') details[key] = 'fieldNotEditable';
  }
  if (typeof b.questionId !== 'string' || !b.questionId) details.questionId = 'required';
  if (typeof b.choice !== 'number' || !Number.isInteger(b.choice) || b.choice < 0) {
    details.choice = 'quizChoiceInvalid';
  }
  fail(details);
  return { questionId: b.questionId as string, choice: b.choice as number };
}

/** POST /api/v1/assessments { skillId, difficulty, language, length? } */
export async function postAssessment(req: Request, res: Response) {
  const assessment = await startAssessment(req.user!._id, parseStart(req.body));
  res.status(201).json({ data: { assessment }, error: null, meta: {} });
}

/** POST /api/v1/assessments/:id/answers { questionId, choice } */
export async function postAnswer(req: Request, res: Response) {
  const data = await answerQuestion(req.user!._id, req.params.id, parseAnswer(req.body));
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/assessments (history) */
export async function getAssessments(req: Request, res: Response) {
  res.json({
    data: { assessments: await listAssessments(req.user!._id) },
    error: null,
    meta: {},
  });
}

/** GET /api/v1/assessments/:id (resume or report) */
export async function getOneAssessment(req: Request, res: Response) {
  res.json({
    data: { assessment: await getAssessment(req.user!._id, req.params.id) },
    error: null,
    meta: {},
  });
}

/** POST /api/v1/assessments/:id/cancel */
export async function postCancel(req: Request, res: Response) {
  res.json({
    data: { assessment: await cancelAssessment(req.user!._id, req.params.id) },
    error: null,
    meta: {},
  });
}
