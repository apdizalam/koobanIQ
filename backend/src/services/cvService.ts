import type { Types } from 'mongoose';
import { runAi } from '../ai/aiService.js';
import { assertPersonalDataAllowed } from '../ai/personalData.js';
import { cvPrompt } from '../ai/prompts/cv.js';
import type { AiLanguage } from '../ai/schemas/common.js';
import { buildCvAnswerSchema } from '../ai/schemas/cv.js';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { Cv, toPublicCv } from '../models/Cv.js';
import { JobDescription, toPublicJobDescription } from '../models/JobDescription.js';
import { Profile, toPublicProfile } from '../models/Profile.js';
import { Skill, toPublicSkill } from '../models/Skill.js';
import { assembleCv, computeMissingInfo, prepareCvInput, profileIsEmpty } from './cvFacts.js';

/** Most CVs one user keeps (all versions). */
export const CVS_MAX = 200;

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/**
 * POST /cvs/generate (TIQ-9): a CV for one of the user's job descriptions, in
 * the CV language the user chose. Uses only the user's own profile and skills;
 * facts are copied by code, the AI only selects and words them. Generating
 * again (same or other language) makes a new version.
 */
export async function generateCv(
  user: { _id: Types.ObjectId; email: string },
  request: { jobDescriptionId: string; language: AiLanguage },
) {
  // Free tier: real users' profiles never go to the AI (owner decision).
  assertPersonalDataAllowed(user.email);

  const jd = isItemId(request.jobDescriptionId)
    ? await JobDescription.findOne({ _id: request.jobDescriptionId, userId: user._id })
    : null;
  if (!jd) throw new AppError(404, 'JOB_DESCRIPTION_NOT_FOUND', 'Job description not found');

  if ((await Cv.countDocuments({ userId: user._id })) >= CVS_MAX) {
    throw new AppError(409, 'CV_LIMIT_REACHED', 'You have the most CVs allowed. Delete some first');
  }

  const profileDoc = await Profile.findOne({ userId: user._id });
  const profile = profileDoc
    ? toPublicProfile(profileDoc)
    : toPublicProfile(new Profile({ userId: user._id }));
  const skills = (await Skill.find({ userId: user._id }).sort({ key: 1 })).map(toPublicSkill);
  const job = toPublicJobDescription(jd).extracted;

  const input = prepareCvInput(profile, skills, job);
  const missingInfo = computeMissingInfo(profile, input, job);
  if (profileIsEmpty(input)) {
    throw new AppError(
      422,
      'PROFILE_INCOMPLETE',
      'Add your experience, education or skills to your profile before creating a CV',
    );
  }

  const answer = await runAi({
    feature: 'cv_generation',
    userId: user._id,
    prompt: cvPrompt(input, request.language),
    schema: buildCvAnswerSchema(input),
    maxOutputTokens: 4096,
    temperature: 0.3,
  });
  const content = assembleCv(profile, skills, answer, { email: user.email }, request.language);

  const previous = await Cv.findOne({
    userId: user._id,
    jobDescriptionId: jd._id,
    language: request.language,
  }).sort({ version: -1 });
  try {
    const cv = await Cv.create({
      userId: user._id,
      jobDescriptionId: jd._id,
      language: request.language,
      version: (previous?.version ?? 0) + 1,
      content,
      missingInfo,
    });
    return toPublicCv(cv);
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new AppError(
        409,
        'CV_GENERATION_IN_PROGRESS',
        'This CV is already being created. Try again in a moment',
      );
    }
    throw err;
  }
}

async function ownCv(userId: Types.ObjectId, id: unknown) {
  const cv = isItemId(id) ? await Cv.findOne({ _id: id, userId }) : null;
  if (!cv) throw new AppError(404, 'CV_NOT_FOUND', 'CV not found');
  return cv;
}

/** GET /cvs: newest first, without the content. */
export async function listCvs(userId: Types.ObjectId) {
  return (await Cv.find({ userId }).sort({ createdAt: -1 })).map((cv) => toPublicCv(cv, false));
}

export async function getCv(userId: Types.ObjectId, id: unknown) {
  return toPublicCv(await ownCv(userId, id));
}

export async function deleteCv(userId: Types.ObjectId, id: unknown) {
  await (await ownCv(userId, id)).deleteOne();
}

/** Deleting an account deletes its CVs too. */
export async function deleteCvs(userId: Types.ObjectId) {
  await Cv.deleteMany({ userId });
}
