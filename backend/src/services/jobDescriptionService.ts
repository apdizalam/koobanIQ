import { createHash } from 'node:crypto';
import type { Types } from 'mongoose';
import { runAi } from '../ai/aiService.js';
import { jobDescriptionPrompt } from '../ai/prompts/jobDescription.js';
import {
  jobDescriptionExtractionSchema,
  type JobDescriptionExtraction,
} from '../ai/schemas/jobDescription.js';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import type { JobDescriptionInput } from '../lib/validateJobDescription.js';
import { JobDescription, toPublicJobDescription } from '../models/JobDescription.js';

/** Most job descriptions one user keeps. */
export const JOB_DESCRIPTIONS_MAX = 100;

const lower = (value: string) => value.toLowerCase().replace(/\s+/g, ' ');

/**
 * Product rule "never invent": a skill from pasted text is kept only if the
 * text mentions it (the whole name, or one of its words of 3+ letters, so
 * "MS Excel" still matches "Microsoft Excel"). Works in English and Somali.
 */
export function keepSkillsFoundIn(text: string, skills: string[]) {
  const haystack = lower(text);
  const kept = skills.filter((skill) => {
    const name = lower(skill).trim();
    if (haystack.includes(name)) return true;
    return name
      .split(/[^\p{L}\p{N}+#]+/u)
      .filter((word) => word.length >= 3)
      .some((word) => haystack.includes(word));
  });
  return { kept, dropped: skills.length - kept.length };
}

function hashOf(input: JobDescriptionInput) {
  const content = input.kind === 'text' ? lower(input.text).trim() : input.bytes;
  return createHash('sha256').update(content).digest('hex');
}

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/**
 * POST /job-descriptions: extracts the facts of a job ad with the AI and saves
 * them for the user. The same ad again returns the saved result (no AI request).
 */
export async function createJobDescription(userId: Types.ObjectId, input: JobDescriptionInput) {
  const hash = hashOf(input);
  const existing = await JobDescription.findOne({ userId, hash });
  if (existing) return { jobDescription: toPublicJobDescription(existing, true), reused: true };

  if ((await JobDescription.countDocuments({ userId })) >= JOB_DESCRIPTIONS_MAX) {
    throw new AppError(
      409,
      'JD_LIMIT_REACHED',
      'You have saved the most job descriptions allowed. Delete one first',
    );
  }

  const extracted: JobDescriptionExtraction = await runAi({
    feature: 'jd_extraction',
    userId,
    prompt: jobDescriptionPrompt(input.kind === 'text' ? { text: input.text } : { hasPdf: true }),
    schema: jobDescriptionExtractionSchema,
    maxOutputTokens: 4096,
    temperature: 0,
    documents:
      input.kind === 'pdf' ? [{ mimeType: 'application/pdf', data: input.data }] : undefined,
  });
  if (!extracted.isJobDescription) {
    throw new AppError(
      422,
      'NOT_A_JOB_DESCRIPTION',
      'This does not look like a job description. Paste or upload a job advertisement',
    );
  }

  let dropped = 0;
  if (input.kind === 'text') {
    const required = keepSkillsFoundIn(input.text, extracted.requiredSkills);
    const preferred = keepSkillsFoundIn(input.text, extracted.preferredSkills);
    extracted.requiredSkills = required.kept;
    extracted.preferredSkills = preferred.kept;
    dropped = required.dropped + preferred.dropped;
  }
  const { isJobDescription: _isJd, ...facts } = extracted;
  void _isJd;

  try {
    const saved = await JobDescription.create({
      userId,
      source: input.kind,
      hash,
      rawText: input.kind === 'text' ? input.text : undefined,
      fileName: input.kind === 'pdf' ? (input.fileName ?? undefined) : undefined,
      extracted: {
        ...facts,
        title: facts.title ?? undefined,
        company: facts.company ?? undefined,
        location: facts.location ?? undefined,
        jobType: facts.jobType ?? undefined,
        deadline: facts.deadline ?? undefined,
      },
      droppedSkills: dropped,
    });
    return { jobDescription: toPublicJobDescription(saved, true), reused: false };
  } catch (err) {
    // The same ad sent twice at the same moment: return the one that was saved.
    if (isDuplicateKey(err)) {
      const first = await JobDescription.findOne({ userId, hash });
      if (first) return { jobDescription: toPublicJobDescription(first, true), reused: true };
    }
    throw err;
  }
}

/** The user's own job description, or 404 (another user's id is "not found" too). */
async function ownJobDescription(userId: Types.ObjectId, id: unknown) {
  const jd = isItemId(id) ? await JobDescription.findOne({ _id: id, userId }) : null;
  if (!jd) throw new AppError(404, 'JOB_DESCRIPTION_NOT_FOUND', 'Job description not found');
  return jd;
}

/** GET /job-descriptions: newest first, without the full text. */
export async function listJobDescriptions(userId: Types.ObjectId) {
  const list = await JobDescription.find({ userId }).sort({ createdAt: -1 });
  return list.map((jd) => toPublicJobDescription(jd));
}

/** GET /job-descriptions/:id (with the pasted text). */
export async function getJobDescription(userId: Types.ObjectId, id: unknown) {
  return toPublicJobDescription(await ownJobDescription(userId, id), true);
}

/** DELETE /job-descriptions/:id */
export async function deleteJobDescription(userId: Types.ObjectId, id: unknown) {
  await (await ownJobDescription(userId, id)).deleteOne();
}

/** Deleting an account deletes its job descriptions too. */
export async function deleteJobDescriptions(userId: Types.ObjectId) {
  await JobDescription.deleteMany({ userId });
}
