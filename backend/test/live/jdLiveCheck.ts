/**
 * TIQ-8 End Test, live: npm run ai:check:jd -w backend
 *
 * Sends the 10 SYNTHETIC job descriptions (8 text, 2 PDF) and one non-job
 * text to the real AI provider, validates every answer with the app's Zod
 * schema (one retry, as in the app) and checks the expected facts. Uses about
 * 11 requests of the free quota; never sends personal data. Not part of
 * `npm test` (which uses the mock provider only).
 */
import {
  generateValidated,
  InvalidAiOutputError,
  providerFromSettings,
} from '../../src/ai/aiService.js';
import { jobDescriptionPrompt } from '../../src/ai/prompts/jobDescription.js';
import { AiProviderError } from '../../src/ai/provider.js';
import { jobDescriptionExtractionSchema } from '../../src/ai/schemas/jobDescription.js';
import { keepSkillsFoundIn } from '../../src/services/jobDescriptionService.js';
import { makePdf } from '../support/pdf.js';
import {
  NOT_A_JOB_DESCRIPTION,
  SAMPLE_JOB_DESCRIPTIONS,
} from '../support/sampleJobDescriptions.js';

/** Pause between requests (free-tier requests-per-minute limit). */
const GAP_MS = 4500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const provider = providerFromSettings();
  if (!provider) {
    console.error(
      'AI is not configured: set AI_PROVIDER=gemini and GEMINI_API_KEY in backend/.env',
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Provider: ${provider.name} · model: ${provider.model} · ${SAMPLE_JOB_DESCRIPTIONS.length} synthetic job descriptions\n`,
  );

  let failures = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const sample of SAMPLE_JOB_DESCRIPTIONS) {
    const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
    const started = Date.now();
    const problems: string[] = [];
    try {
      const pdf = sample.kind === 'pdf' ? makePdf(sample.text.split('\n')) : null;
      const result = await generateValidated({
        provider,
        prompt: jobDescriptionPrompt(pdf ? { hasPdf: true } : { text: sample.text }),
        schema: jobDescriptionExtractionSchema,
        maxOutputTokens: 4096,
        temperature: 0,
        documents: pdf
          ? [{ mimeType: 'application/pdf', data: pdf.toString('base64') }]
          : undefined,
        usage,
      });
      if (sample.kind === 'text') {
        result.requiredSkills = keepSkillsFoundIn(sample.text, result.requiredSkills).kept;
        result.preferredSkills = keepSkillsFoundIn(sample.text, result.preferredSkills).kept;
      }
      const e = sample.expect;
      if (!result.isJobDescription) problems.push('not recognised as a job description');
      if (result.language !== sample.language) problems.push(`language ${result.language}`);
      if (e.titleIncludes && !result.title?.toLowerCase().includes(e.titleIncludes.toLowerCase())) {
        problems.push(`title "${result.title}"`);
      }
      if (
        e.company !== undefined &&
        (e.company === null ? result.company !== null : !result.company?.includes(e.company))
      ) {
        problems.push(`company "${result.company}"`);
      }
      if (e.deadline !== undefined && result.deadline !== e.deadline) {
        problems.push(`deadline ${result.deadline}`);
      }
      const all = JSON.stringify(result);
      for (const word of e.mustNotContain ?? []) {
        if (all.includes(word)) problems.push(`contains "${word}" (injected text was followed)`);
      }
      tokensIn += usage.inputTokens;
      tokensOut += usage.outputTokens;
      if (problems.length) failures += 1;
      console.log(
        `${problems.length ? 'CHECK' : 'OK   '} ${sample.id.padEnd(24)} ${sample.kind.padEnd(4)} ${sample.language} · ` +
          `${Date.now() - started} ms · attempts ${usage.attempts} · title "${result.title}" · ` +
          `required ${result.requiredSkills.length} / preferred ${result.preferredSkills.length} · deadline ${result.deadline}` +
          (problems.length ? `\n      ↳ ${problems.join('; ')}` : ''),
      );
    } catch (err) {
      failures += 1;
      const why =
        err instanceof AiProviderError
          ? `${err.kind}: ${err.message}`
          : err instanceof InvalidAiOutputError
            ? `invalid answer after ${usage.attempts} attempts (${err.reason})`
            : String(err);
      console.log(`FAIL  ${sample.id.padEnd(24)} ${why}`);
    }
    await sleep(GAP_MS);
  }

  // The non-job text must be recognised as such.
  try {
    const notJd = await generateValidated({
      provider,
      prompt: jobDescriptionPrompt({ text: NOT_A_JOB_DESCRIPTION }),
      schema: jobDescriptionExtractionSchema,
      temperature: 0,
    });
    const ok = !notJd.isJobDescription;
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'OK   ' : 'CHECK'} ${'not-a-job (tea recipe)'.padEnd(24)} isJobDescription=${notJd.isJobDescription}`,
    );
  } catch (err) {
    failures += 1;
    console.log(`FAIL  not-a-job: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`\nTokens: in ${tokensIn} / out ${tokensOut}`);
  console.log(
    failures === 0
      ? 'TIQ-8 live check passed (11/11).'
      : `TIQ-8 live check: ${failures} problem(s).`,
  );
  if (failures > 0) process.exitCode = 1;
}

void run();
