/**
 * TIQ-19 live check: npm run ai:check:interview -w backend
 *
 * Synthetic data only (a job title and invented practice answers, no profile).
 * For each case the real AI writes 3 questions with the app's own prompt and
 * Zod schema, then  gives feedback on a sample and a weak made-up answer; the weak
 * one must score 0–2 (the sample is shown for reading: it may not fit the question). About 6 requests of the free quota. Not part of `npm test`.
 */
import {
  generateValidated,
  InvalidAiOutputError,
  providerFromSettings,
} from '../../src/ai/aiService.js';
import {
  interviewFeedbackPrompt,
  interviewQuestionsPrompt,
} from '../../src/ai/prompts/interview.js';
import { AiProviderError } from '../../src/ai/provider.js';
import type { AiLanguage } from '../../src/ai/schemas/common.js';
import {
  interviewFeedbackSchema,
  interviewQuestionsSchema,
  type InterviewType,
} from '../../src/ai/schemas/interview.js';
import { INTERVIEW_AI_TIMEOUT_MS } from '../../src/services/interviewService.js';

const GAP_MS = 4500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const GOOD =
  'In my last role I had to deliver a monthly report while two colleagues were away. I listed the tasks, asked my manager which were most urgent, finished the data checks first and sent the report one day early. Since then I plan a week ahead and share progress every Monday.';
const WEAK = 'I am good.';

async function run() {
  const provider = providerFromSettings();
  if (!provider) {
    console.error(
      'AI is not configured: set AI_PROVIDER=gemini and GEMINI_API_KEY in backend/.env',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Provider: ${provider.name} · model: ${provider.model} · synthetic data only\n`);

  const cases: [InterviewType, string, AiLanguage][] = [
    ['behavioral', 'Data officer', 'en'],
    ['technical', 'Accountant', 'so'],
  ];
  let failures = 0;
  for (const [type, role, language] of cases) {
    const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
    const started = Date.now();
    try {
      const target = { role };
      const { questions } = await generateValidated({
        provider,
        prompt: interviewQuestionsPrompt({ type, target, count: 3, language }),
        schema: interviewQuestionsSchema(3),
        maxOutputTokens: 4096,
        temperature: 0.6,
        timeoutMs: INTERVIEW_AI_TIMEOUT_MS,
        usage,
      });
      await sleep(GAP_MS);
      const scores: number[] = [];
      for (const answer of [GOOD, WEAK]) {
        const fb = await generateValidated({
          provider,
          prompt: interviewFeedbackPrompt({
            type,
            target,
            question: questions[0].question,
            answer,
            language,
          }),
          schema: interviewFeedbackSchema,
          maxOutputTokens: 2048,
          temperature: 0.3,
          timeoutMs: INTERVIEW_AI_TIMEOUT_MS,
          usage,
        });
        scores.push(fb.score);
        console.log(
          `      feedback (${answer === GOOD ? 'sample' : 'weak'}): ${fb.score}/10 · ${fb.summary}`,
        );
        await sleep(GAP_MS);
      }
      // The sample answer may not fit the AI's question (it is judged honestly, shown for
      // reading); a non-answer must always score low.
      const ok = scores[1] <= 2;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'OK   ' : 'CHECK'} ${type.padEnd(16)} ${role} · ${language} · ${Date.now() - started} ms · tokens ${usage.inputTokens}/${usage.outputTokens}\n` +
          `      q1: ${questions[0].question} [${questions[0].focus}]\n` +
          `      scores: sample ${scores[0]} · weak ${scores[1]}`,
      );
    } catch (err) {
      failures += 1;
      const why =
        err instanceof AiProviderError
          ? `${err.kind}: ${err.message}`
          : err instanceof InvalidAiOutputError
            ? `invalid answer after ${usage.attempts} attempts (${err.reason})`
            : String(err);
      console.log(`FAIL  ${type} ${role} ${language} · ${why}`);
    }
  }
  console.log(`\n${cases.length - failures}/${cases.length} passed`);
  if (failures > 0) process.exitCode = 1;
}

void run();
