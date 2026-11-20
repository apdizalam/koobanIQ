import type { Types } from 'mongoose';
import { runAi } from '../ai/aiService.js';
import {
  interviewFeedbackPrompt,
  interviewQuestionsPrompt,
  type InterviewTarget,
} from '../ai/prompts/interview.js';
import type { AiLanguage } from '../ai/schemas/common.js';
import {
  interviewFeedbackSchema,
  interviewQuestionsSchema,
  type InterviewFeedback,
  type InterviewLength,
  type InterviewType,
} from '../ai/schemas/interview.js';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { Interview, type InterviewDocument } from '../models/Interview.js';
import { Job } from '../models/Job.js';
import { JobDescription } from '../models/JobDescription.js';

/** Writing up to 10 questions can take a while on the free tier. */
export const INTERVIEW_AI_TIMEOUT_MS = 60_000;

export interface InterviewStart {
  type: InterviewType;
  /** Job title (required unless the session is based on a job ad or stored job). */
  role?: string;
  jobDescriptionId?: string;
  jobId?: string;
  language: AiLanguage;
  length: InterviewLength;
}

type Doc = InterviewDocument;
type Answer = { questionId: string; answer: string; feedback: InterviewFeedback; answeredAt: Date };
const answersOf = (doc: Doc) => doc.answers as unknown as Answer[];

/** The question still to answer (in order), or null when the session is over. */
function currentQuestion(doc: Doc) {
  if (doc.status !== 'in_progress') return null;
  const done = new Set(answersOf(doc).map((a) => a.questionId));
  const index = doc.questions.findIndex((q) => !done.has(q.id));
  if (index < 0) return null;
  const q = doc.questions[index];
  return {
    id: q.id,
    number: index + 1,
    total: doc.questions.length,
    question: q.question,
    focus: q.focus,
  };
}

/** Summary of a finished session, by code: average score and per-question scores. */
function summaryOf(doc: Doc) {
  const answers = answersOf(doc);
  if (answers.length === 0) return null;
  const total = answers.reduce((sum, a) => sum + a.feedback.score, 0);
  return {
    averageScore: Math.round((total / answers.length) * 10) / 10,
    answered: answers.length,
    best: [...answers].sort((a, b) => b.feedback.score - a.feedback.score)[0].questionId,
    weakest: [...answers].sort((a, b) => a.feedback.score - b.feedback.score)[0].questionId,
  };
}

export function toPublicInterview(doc: Doc, withTranscript = true) {
  const answers = answersOf(doc);
  return {
    id: String(doc._id),
    type: doc.type,
    role: doc.role,
    employer: doc.employer ?? null,
    jobDescriptionId: doc.jobDescriptionId ? String(doc.jobDescriptionId) : null,
    jobId: doc.jobId ? String(doc.jobId) : null,
    language: doc.language,
    length: doc.length,
    status: doc.status,
    answered: answers.length,
    question: currentQuestion(doc),
    summary: doc.status === 'finished' ? summaryOf(doc) : null,
    /** Questions answered so far, with the user's answer and the feedback (the transcript). */
    transcript: withTranscript
      ? doc.questions
          .map((q, i) => {
            const a = answers.find((x) => x.questionId === q.id);
            return a
              ? {
                  questionId: q.id,
                  number: i + 1,
                  question: q.question,
                  focus: q.focus,
                  answer: a.answer,
                  feedback: a.feedback,
                  answeredAt: a.answeredAt,
                }
              : null;
          })
          .filter((x) => x !== null)
      : undefined,
    createdAt: doc.createdAt,
    finishedAt: doc.finishedAt ?? null,
  };
}

async function ownInterview(userId: Types.ObjectId, id: unknown) {
  const doc = isItemId(id) ? await Interview.findOne({ _id: id, userId }) : null;
  if (!doc) throw new AppError(404, 'INTERVIEW_NOT_FOUND', 'Interview practice not found');
  return doc;
}

/** The job the practice is for: a typed title, or the facts of a job ad / stored job. */
async function targetFor(userId: Types.ObjectId, input: InterviewStart) {
  if (input.jobDescriptionId) {
    const jd = isItemId(input.jobDescriptionId)
      ? await JobDescription.findOne({ _id: input.jobDescriptionId, userId })
      : null;
    if (!jd) throw new AppError(404, 'JOB_DESCRIPTION_NOT_FOUND', 'Job ad not found');
    const e = jd.extracted!;
    return {
      target: {
        role: input.role || e.title || '',
        employer: e.company ?? null,
        skills: [...(e.requiredSkills ?? []), ...(e.preferredSkills ?? [])].slice(0, 15),
        responsibilities: (e.responsibilities ?? []).slice(0, 10),
      } satisfies InterviewTarget,
      jobDescriptionId: jd._id,
      jobId: null,
    };
  }
  if (input.jobId) {
    const job = isItemId(input.jobId) ? await Job.findById(input.jobId) : null;
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
    // The public job ad's own lines (no AI, no profile): its first duties / requirements.
    const lines = (job.description ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter((l) => l.length > 15)
      .slice(0, 10)
      .map((l) => l.slice(0, 200));
    return {
      target: {
        role: input.role || job.title,
        employer: job.employer,
        skills: [],
        responsibilities: lines,
      } satisfies InterviewTarget,
      jobDescriptionId: null,
      jobId: job._id,
    };
  }
  return {
    target: { role: input.role ?? '' } satisfies InterviewTarget,
    jobDescriptionId: null,
    jobId: null,
  };
}

/**
 * POST /interviews (TIQ-19): one AI request writes the session's questions.
 * Sends only the practice type, job title and job facts (never the profile).
 */
export async function startInterview(userId: Types.ObjectId, input: InterviewStart) {
  const { target, jobDescriptionId, jobId } = await targetFor(userId, input);
  if (!target.role.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      role: 'required',
    });
  }
  const answer = await runAi({
    feature: 'interview',
    userId,
    prompt: interviewQuestionsPrompt({
      type: input.type,
      target,
      count: input.length,
      language: input.language,
    }),
    schema: interviewQuestionsSchema(input.length),
    maxOutputTokens: 4096,
    temperature: 0.6,
    timeoutMs: INTERVIEW_AI_TIMEOUT_MS,
  });
  const doc = await Interview.create({
    userId,
    type: input.type,
    role: target.role.trim(),
    employer: target.employer ?? null,
    skills: target.skills ?? [],
    responsibilities: target.responsibilities ?? [],
    jobDescriptionId,
    jobId,
    language: input.language,
    length: input.length,
    questions: answer.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
  });
  return toPublicInterview(doc);
}

/**
 * POST /interviews/:id/answers { questionId, answer }: AI feedback on the
 * typed answer to the current question; the last answer finishes the session.
 */
export async function answerInterview(
  userId: Types.ObjectId,
  id: unknown,
  input: { questionId: string; answer: string },
) {
  const doc = await ownInterview(userId, id);
  if (doc.status !== 'in_progress') {
    throw new AppError(409, 'INTERVIEW_NOT_IN_PROGRESS', 'This practice is already finished');
  }
  const current = currentQuestion(doc);
  if (!current || current.id !== input.questionId) {
    throw new AppError(409, 'QUESTION_NOT_CURRENT', 'This question was already answered');
  }
  const feedback = await runAi({
    feature: 'interview',
    userId,
    prompt: interviewFeedbackPrompt({
      type: doc.type as InterviewType,
      target: {
        role: doc.role,
        employer: doc.employer,
        skills: doc.skills,
        responsibilities: doc.responsibilities,
      },
      question: current.question,
      answer: input.answer,
      language: doc.language as AiLanguage,
    }),
    schema: interviewFeedbackSchema,
    maxOutputTokens: 2048,
    temperature: 0.3,
    // A live check once took over 30 s for one feedback on the free tier.
    timeoutMs: INTERVIEW_AI_TIMEOUT_MS,
  });
  doc.answers.push({
    questionId: current.id,
    answer: input.answer,
    feedback,
    answeredAt: new Date(),
  });
  if (answersOf(doc).length >= doc.questions.length) {
    doc.status = 'finished';
    doc.finishedAt = new Date();
  }
  await doc.save();
  return { feedback: { questionId: current.id, ...feedback }, interview: toPublicInterview(doc) };
}

/** GET /interviews: history, newest first, without transcripts. */
export async function listInterviews(userId: Types.ObjectId) {
  const docs = await Interview.find({ userId }).sort({ createdAt: -1 }).limit(100);
  return docs.map((doc) => toPublicInterview(doc, false));
}

/** GET /interviews/:id: resume (current question) or read the transcript and summary. */
export async function getInterview(userId: Types.ObjectId, id: unknown) {
  return toPublicInterview(await ownInterview(userId, id));
}

/** POST /interviews/:id/cancel: stop; answers so far stay in the transcript. */
export async function cancelInterview(userId: Types.ObjectId, id: unknown) {
  const doc = await ownInterview(userId, id);
  if (doc.status === 'in_progress') {
    doc.status = 'cancelled';
    await doc.save();
  }
  return toPublicInterview(doc);
}

/** DELETE /interviews/:id: the user removes a session and its transcript. */
export async function deleteInterview(userId: Types.ObjectId, id: unknown) {
  const doc = await ownInterview(userId, id);
  await doc.deleteOne();
}

/** Deleting an account deletes its practice sessions (they hold its answers). */
export async function deleteInterviews(userId: Types.ObjectId) {
  await Interview.deleteMany({ userId });
}
