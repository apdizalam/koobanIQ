import type { Types } from 'mongoose';
import { runAi } from '../ai/aiService.js';
import { quizPrompt } from '../ai/prompts/quiz.js';
import type { AiLanguage } from '../ai/schemas/common.js';
import { quizBankSchema, type QuizDifficulty } from '../ai/schemas/quiz.js';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { Assessment, type AssessmentDocument } from '../models/Assessment.js';
import { Skill } from '../models/Skill.js';
import {
  afterAnswer,
  pickNext,
  prepareBank,
  quizResult,
  type AskedQuestion,
  type BankQuestion,
  type QuizResult,
  type QuizState,
} from './quizEngine.js';
import { recordAssessment } from './skillService.js';

/**
 * A 15-question bank is a long answer (Somali especially: a live check took
 * over 30 s once), so quiz generation may take up to a minute.
 */
export const QUIZ_AI_TIMEOUT_MS = 60_000;

type Doc = AssessmentDocument;
const bankOf = (doc: Doc) => doc.bank as unknown as BankQuestion[];
const askedOf = (doc: Doc) => doc.asked as unknown as AskedQuestion[];
const stateOf = (doc: Doc): QuizState => ({
  difficulty: doc.state!.difficulty as QuizDifficulty,
  streak: doc.state!.streak ?? 0,
  focusTopic: doc.state!.focusTopic ?? null,
});

/** The question as the app sees it: no correct answer, no explanation yet. */
function publicQuestion(doc: Doc) {
  const q = bankOf(doc).find((b) => b.id === doc.currentQuestionId);
  if (!q || doc.status !== 'in_progress') return null;
  return {
    id: q.id,
    number: askedOf(doc).length + 1,
    total: doc.length,
    difficulty: q.difficulty,
    topic: q.topic,
    question: q.question,
    options: q.options,
  };
}

export function toPublicAssessment(doc: Doc) {
  return {
    id: String(doc._id),
    skillId: String(doc.skillId),
    skillName: doc.skillName,
    language: doc.language,
    length: doc.length,
    startDifficulty: doc.startDifficulty,
    status: doc.status,
    difficulty: doc.state!.difficulty,
    answered: askedOf(doc).length,
    question: publicQuestion(doc),
    result: (doc.result as QuizResult | null) ?? null,
    createdAt: doc.createdAt,
    finishedAt: doc.finishedAt ?? null,
  };
}

async function ownAssessment(userId: Types.ObjectId, id: unknown) {
  const doc = isItemId(id) ? await Assessment.findOne({ _id: id, userId }) : null;
  if (!doc) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Quiz not found');
  return doc;
}

/**
 * POST /assessments (TIQ-13): one AI request writes the question bank for one
 * of the user's skills (only the skill name is sent). Any unfinished quiz for
 * the same skill is cancelled. Returns the first question.
 */
export async function startAssessment(
  userId: Types.ObjectId,
  input: { skillId: string; difficulty: QuizDifficulty; language: AiLanguage; length: 5 | 10 },
) {
  const skill = isItemId(input.skillId)
    ? await Skill.findOne({ _id: input.skillId, userId })
    : null;
  if (!skill) throw new AppError(404, 'SKILL_NOT_FOUND', 'Skill not found');

  const answer = await runAi({
    feature: 'skill_quiz',
    userId,
    prompt: quizPrompt({ skill: skill.name, language: input.language }),
    schema: quizBankSchema,
    maxOutputTokens: 8192,
    temperature: 0.4,
    timeoutMs: QUIZ_AI_TIMEOUT_MS,
  });
  const bank = prepareBank(answer.questions);
  const state: QuizState = { difficulty: input.difficulty, streak: 0, focusTopic: null };
  const first = pickNext(bank, [], state)!;

  await Assessment.updateMany(
    { userId, skillId: skill._id, status: 'in_progress' },
    { status: 'cancelled' },
  );
  const doc = await Assessment.create({
    userId,
    skillId: skill._id,
    skillName: skill.name,
    language: input.language,
    length: input.length,
    startDifficulty: input.difficulty,
    bank,
    currentQuestionId: first.id,
    state,
  });
  return toPublicAssessment(doc);
}

/**
 * POST /assessments/:id/answers { questionId, choice }: checks the answer to
 * the current question, picks the next one adaptively, and at the end saves
 * the result and sets the skill's assessed level and gaps.
 */
export async function answerQuestion(
  userId: Types.ObjectId,
  id: unknown,
  input: { questionId: string; choice: number },
) {
  const doc = await ownAssessment(userId, id);
  if (doc.status !== 'in_progress') {
    throw new AppError(409, 'ASSESSMENT_NOT_IN_PROGRESS', 'This quiz is already finished');
  }
  const bank = bankOf(doc);
  const question = bank.find((q) => q.id === doc.currentQuestionId);
  if (!question || input.questionId !== question.id) {
    throw new AppError(409, 'QUESTION_NOT_CURRENT', 'This question was already answered');
  }
  if (input.choice >= question.options.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      choice: 'quizChoiceInvalid',
    });
  }

  const correct = input.choice === question.answer;
  const answer: AskedQuestion = {
    questionId: question.id,
    choice: input.choice,
    correct,
    difficulty: question.difficulty,
    topic: question.topic,
  };
  const asked = [...askedOf(doc), answer];
  const state = afterAnswer(stateOf(doc), question, correct);
  const next = asked.length < doc.length ? pickNext(bank, asked, state) : null;

  doc.asked.push({ ...answer, answeredAt: new Date() });
  doc.set('state', state);
  doc.currentQuestionId = next?.id ?? null;

  if (!next) {
    const result = quizResult(asked);
    doc.status = 'finished';
    doc.result = result;
    doc.finishedAt = new Date();
    await doc.save();
    // The skill may have been deleted during the quiz; the result is still kept.
    await recordAssessment(userId, String(doc.skillId), {
      level: result.level,
      gaps: result.gaps,
      at: doc.finishedAt,
    }).catch((err: unknown) => {
      if (!(err instanceof AppError && err.code === 'SKILL_NOT_FOUND')) throw err;
    });
  } else {
    await doc.save();
  }

  return {
    feedback: {
      questionId: question.id,
      correct,
      correctChoice: question.answer,
      explanation: question.explanation,
    },
    assessment: toPublicAssessment(doc),
  };
}

/** GET /assessments: newest first (history), without questions. */
export async function listAssessments(userId: Types.ObjectId) {
  const docs = await Assessment.find({ userId }).sort({ createdAt: -1 }).limit(100);
  return docs.map((doc) => {
    const { question: _question, ...rest } = toPublicAssessment(doc);
    void _question;
    return rest;
  });
}

/** GET /assessments/:id: to resume a quiz (current question) or show its report. */
export async function getAssessment(userId: Types.ObjectId, id: unknown) {
  return toPublicAssessment(await ownAssessment(userId, id));
}

/** POST /assessments/:id/cancel: leaves a quiz safely; the skill does not change. */
export async function cancelAssessment(userId: Types.ObjectId, id: unknown) {
  const doc = await ownAssessment(userId, id);
  if (doc.status === 'in_progress') {
    doc.status = 'cancelled';
    doc.currentQuestionId = null;
    await doc.save();
  }
  return toPublicAssessment(doc);
}

/** Deleting an account deletes its quizzes too. */
export async function deleteAssessments(userId: Types.ObjectId) {
  await Assessment.deleteMany({ userId });
}
