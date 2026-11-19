/**
 * TIQ-9 live check: npm run ai:check:cv -w backend
 *
 * SYNTHETIC profiles only (made-up people, employers and schools; owner
 * decision: no real personal data on the free tier). Builds each CV in English
 * and Somali with the real AI provider and the app's own pipeline (minimised
 * input → per-request schema with claim checks → facts copied by code), then
 * runs the End Test diff: every fact in the CV must exist in the profile.
 * About 4 requests of the free quota. Not part of `npm test`.
 */
import { Types } from 'mongoose';
import {
  generateValidated,
  InvalidAiOutputError,
  providerFromSettings,
} from '../../src/ai/aiService.js';
import { cvPrompt } from '../../src/ai/prompts/cv.js';
import { AiProviderError } from '../../src/ai/provider.js';
import type { AiLanguage } from '../../src/ai/schemas/common.js';
import { buildCvAnswerSchema } from '../../src/ai/schemas/cv.js';
import { Profile, toPublicProfile } from '../../src/models/Profile.js';
import { Skill, toPublicSkill } from '../../src/models/Skill.js';
import { assembleCv, computeMissingInfo, prepareCvInput } from '../../src/services/cvFacts.js';
import {
  DEVELOPER_JOB,
  DEVELOPER_PROFILE,
  HEALTH_JOB,
  HEALTH_PROFILE,
  type SampleProfile,
} from '../support/sampleProfiles.js';

const GAP_MS = 4500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The synthetic profile as the app stores it (in memory; nothing is saved). */
function build(sample: SampleProfile) {
  const userId = new Types.ObjectId();
  const profile = toPublicProfile(
    new Profile({
      userId,
      personal: sample.personal,
      experience: sample.experience,
      education: sample.education,
      projects: sample.projects,
      certifications: sample.certifications,
      languages: sample.languages,
    }),
  );
  const skills = sample.skills.map((s) =>
    toPublicSkill(new Skill({ userId, key: s.name.toLowerCase(), ...s })),
  );
  return { profile, skills };
}

/** End Test diff: every fact in the CV must be the profile's own value. */
function diffProblems(cv: ReturnType<typeof assembleCv>, sample: SampleProfile) {
  const problems: string[] = [];
  const has = (list: Record<string, unknown>[], pick: Record<string, unknown>) =>
    list.some((item) =>
      Object.entries(pick).every(([k, v]) => v === null || v === undefined || item[k] === v),
    );
  if (cv.header.fullName !== (sample.personal.fullName ?? null)) problems.push('name');
  for (const e of cv.experience) {
    if (
      !has(sample.experience, {
        title: e.title,
        employer: e.employer,
        startDate: e.startDate,
        endDate: e.endDate ?? undefined,
      })
    ) {
      problems.push(`experience "${e.title}"`);
    }
  }
  for (const e of cv.education) {
    if (!has(sample.education, { school: e.school, degree: e.degree, field: e.field }))
      problems.push(`education "${e.school}"`);
  }
  for (const c of cv.certifications) {
    if (!has(sample.certifications, { name: c.name, issuer: c.issuer }))
      problems.push(`certificate "${c.name}"`);
  }
  for (const s of cv.skills) {
    if (!sample.skills.some((own) => own.name === s.name)) problems.push(`skill "${s.name}"`);
  }
  return problems;
}

async function run() {
  const provider = providerFromSettings();
  if (!provider) {
    console.error(
      'AI is not configured: set AI_PROVIDER=gemini and GEMINI_API_KEY in backend/.env',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Provider: ${provider.name} · model: ${provider.model} · synthetic profiles only\n`);

  let failures = 0;
  const cases: [SampleProfile, typeof HEALTH_JOB | typeof DEVELOPER_JOB, AiLanguage][] = [
    [HEALTH_PROFILE, HEALTH_JOB, 'en'],
    [HEALTH_PROFILE, HEALTH_JOB, 'so'],
    [DEVELOPER_PROFILE, DEVELOPER_JOB, 'en'],
    [DEVELOPER_PROFILE, DEVELOPER_JOB, 'so'],
  ];
  for (const [sample, job, language] of cases) {
    const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
    const started = Date.now();
    const { profile, skills } = build(sample);
    const input = prepareCvInput(profile, skills, job);
    const missing = computeMissingInfo(profile, input, job);
    try {
      const answer = await generateValidated({
        provider,
        prompt: cvPrompt(input, language),
        schema: buildCvAnswerSchema(input),
        maxOutputTokens: 4096,
        temperature: 0.3,
        usage,
      });
      const cv = assembleCv(profile, skills, answer, { email: 'test@example.com' }, language);
      const problems = diffProblems(cv, sample);
      if (problems.length) failures += 1;
      console.log(
        `${problems.length ? 'CHECK' : 'OK   '} ${sample.id.padEnd(15)} ${language} · ${Date.now() - started} ms · attempts ${usage.attempts} · ` +
          `tokens ${usage.inputTokens}/${usage.outputTokens} · experience ${cv.experience.length} · skills ${cv.skills.length}\n` +
          `      headline: ${cv.header.headline}\n` +
          `      summary:  ${cv.summary}\n` +
          `      missingInfo: ${missing.map((m) => m.type + (m.item ? `:${m.item}` : '')).join(', ') || '(none)'}` +
          (problems.length ? `\n      ↳ facts not in the profile: ${problems.join('; ')}` : ''),
      );
    } catch (err) {
      failures += 1;
      const why =
        err instanceof AiProviderError
          ? `${err.kind}: ${err.message}`
          : err instanceof InvalidAiOutputError
            ? `invalid answer after ${usage.attempts} attempts (${err.reason})`
            : String(err);
      console.log(`FAIL  ${sample.id.padEnd(15)} ${language} · ${why}`);
    }
    await sleep(GAP_MS);
  }
  console.log(
    failures === 0
      ? '\nTIQ-9 live check passed (4/4).'
      : `\nTIQ-9 live check: ${failures} problem(s).`,
  );
  if (failures > 0) process.exitCode = 1;
}

void run();
