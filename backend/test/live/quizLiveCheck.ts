/**
 * TIQ-13 live check: npm run ai:check:quiz -w backend
 *
 * Skill names only (no profile, no personal data). For each case the real AI
 * writes a question bank with the app's own prompt and Zod schema, then a
 * simulated run through the app's adaptive engine shows the End Test:
 * 3 right answers raise the difficulty and a wrong answer is followed by a
 * question on the same topic. About 4 requests of the free quota. Not part of
 * `npm test`.
 */
import {
  generateValidated,
  InvalidAiOutputError,
  providerFromSettings,
} from '../../src/ai/aiService.js';
import { quizPrompt } from '../../src/ai/prompts/quiz.js';
import { AiProviderError } from '../../src/ai/provider.js';
import type { AiLanguage } from '../../src/ai/schemas/common.js';
import { QUIZ_DIFFICULTIES, quizBankSchema } from '../../src/ai/schemas/quiz.js';
import {
  afterAnswer,
  pickNext,
  prepareBank,
  quizResult,
  type AskedQuestion,
  type QuizState,
} from '../../src/services/quizEngine.js';
import { QUIZ_AI_TIMEOUT_MS } from '../../src/services/assessmentService.js';

const GAP_MS = 4500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every topic should come at each difficulty, so a wrong answer can be probed. */
function topicCoverage(questions: { topic: string; difficulty: string }[]) {
  const byTopic = new Map<string, Set<string>>();
  for (const q of questions) {
    const key = q.topic.trim().toLowerCase();
    byTopic.set(key, (byTopic.get(key) ?? new Set()).add(q.difficulty));
  }
  const full = [...byTopic.values()].filter((d) => d.size === QUIZ_DIFFICULTIES.length).length;
  return { topics: byTopic.size, full };
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
  console.log(`Provider: ${provider.name} · model: ${provider.model} · skill names only\n`);

  const cases: [string, AiLanguage][] = [
    ['Microsoft Excel', 'en'],
    ['Microsoft Excel', 'so'],
    ['Report writing', 'en'],
    ['Python', 'so'],
  ];
  let failures = 0;
  for (const [skill, language] of cases) {
    const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
    const started = Date.now();
    try {
      const answer = await generateValidated({
        provider,
        prompt: quizPrompt({ skill, language }),
        schema: quizBankSchema,
        maxOutputTokens: 8192,
        temperature: 0.4,
        timeoutMs: QUIZ_AI_TIMEOUT_MS,
        usage,
      });
      const bank = prepareBank(answer.questions);
      const cover = topicCoverage(bank);

      // Simulated run from Easy: right, right, right (→ Normal), then wrong (→ same topic).
      let state: QuizState = { difficulty: 'easy', streak: 0, focusTopic: null };
      const asked: AskedQuestion[] = [];
      const trace: string[] = [];
      for (const correct of [true, true, true, false, true]) {
        const q = pickNext(bank, asked, state)!;
        asked.push({
          questionId: q.id,
          choice: 0,
          correct,
          difficulty: q.difficulty,
          topic: q.topic,
        });
        trace.push(`${q.difficulty}/${q.topic}${correct ? '✓' : '✗'}`);
        state = afterAnswer(state, q, correct);
      }
      const upAfterThree = asked[3].difficulty === 'normal';
      const probed = asked[4].topic.trim().toLowerCase() === asked[3].topic.trim().toLowerCase();
      const ok = upAfterThree && probed && cover.full >= 3;
      if (!ok) failures += 1;
      const sample = bank.find((q) => q.difficulty === 'normal')!;
      console.log(
        `${ok ? 'OK   ' : 'CHECK'} ${skill.padEnd(16)} ${language} · ${Date.now() - started} ms · attempts ${usage.attempts} · ` +
          `tokens ${usage.inputTokens}/${usage.outputTokens} · topics ${cover.topics} (${cover.full} at all 3 levels)\n` +
          `      run: ${trace.join(' → ')}\n` +
          `      up after 3 right: ${upAfterThree} · wrong answer probed same topic: ${probed} · level ${quizResult(asked).level}\n` +
          `      sample: ${sample.question}\n` +
          `              ${sample.options.map((o, i) => (i === sample.answer ? `[${o}]` : o)).join(' | ')}`,
      );
    } catch (err) {
      failures += 1;
      const why =
        err instanceof AiProviderError
          ? `${err.kind}: ${err.message}`
          : err instanceof InvalidAiOutputError
            ? `invalid answer after ${usage.attempts} attempts (${err.reason})`
            : String(err);
      console.log(`FAIL  ${skill.padEnd(16)} ${language} · ${why}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`\n${cases.length - failures}/${cases.length} passed`);
  if (failures > 0) process.exitCode = 1;
}

void run();
