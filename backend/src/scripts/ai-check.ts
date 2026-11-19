/**
 * Manual AI connectivity check: npm run ai:check -w backend
 *
 * Sends two tiny requests (English and Somali) about a synthetic sentence with
 * no personal data, and checks the answers with the same validation the AI
 * features use. Prints the provider, model, answers and token counts, never
 * the API key. Uses 2 requests (up to 4 with retries) of the free quota.
 */
import { env } from '../config/env.js';
import { generateValidated, InvalidAiOutputError, providerFromSettings } from '../ai/aiService.js';
import { connectivityCheckPrompt } from '../ai/prompts/connectivityCheck.js';
import { AiProviderError } from '../ai/provider.js';
import type { AiLanguage } from '../ai/schemas/common.js';
import { connectivityCheckSchema } from '../ai/schemas/connectivityCheck.js';

async function run() {
  const provider = providerFromSettings();
  if (!provider) {
    console.error(
      `AI is not configured (AI_PROVIDER=${env.aiProvider || '(empty)'}, ` +
        `GEMINI_API_KEY ${env.geminiApiKey ? 'set' : 'missing'}). Add them to backend/.env.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Provider: ${provider.name} · model: ${provider.model}`);

  let failed = 0;
  for (const language of ['en', 'so'] as AiLanguage[]) {
    const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
    const started = Date.now();
    try {
      const answer = await generateValidated({
        provider,
        prompt: connectivityCheckPrompt(language),
        schema: connectivityCheckSchema,
        maxOutputTokens: 512,
        usage,
      });
      const languageOk = answer.language === language;
      const countOk = answer.fruitCount === 3;
      if (!languageOk || !countOk) failed += 1;
      console.log(
        `[${language}] ${languageOk && countOk ? 'OK' : 'UNEXPECTED'} · ${Date.now() - started} ms · ` +
          `attempts ${usage.attempts} · tokens in ${usage.inputTokens} / out ${usage.outputTokens}\n` +
          `     language="${answer.language}" fruitCount=${answer.fruitCount}\n` +
          `     sentence: ${answer.sentence}`,
      );
    } catch (err) {
      failed += 1;
      if (err instanceof AiProviderError) {
        console.error(`[${language}] FAILED (${err.kind}): ${err.message}`);
      } else if (err instanceof InvalidAiOutputError) {
        console.error(
          `[${language}] FAILED: invalid answer after ${usage.attempts} attempts (${err.reason})`,
        );
      } else {
        console.error(`[${language}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  console.log(failed === 0 ? 'AI check passed.' : `AI check: ${failed} of 2 failed.`);
  if (failed > 0) process.exitCode = 1;
}

void run();
