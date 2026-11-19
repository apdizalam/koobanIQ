import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from './provider.js';

/** One prepared answer: JSON (object → stringified), raw text, a provider error, or "hang". */
export type MockReply =
  | { json: unknown; inputTokens?: number; outputTokens?: number; truncated?: boolean }
  | { text: string }
  | { error: AiProviderError }
  /** Never answers; only the time limit ends it (timeout tests). */
  | { hang: true };

/**
 * Provider for automated tests: answers from a queue and records every request.
 * Uses no network and no Gemini quota.
 */
export function createMockProvider(model = 'mock-model') {
  const replies: MockReply[] = [];
  const requests: AiRequest[] = [];

  const provider: AiProvider = {
    name: 'mock',
    model,
    async generate(request: AiRequest): Promise<AiResponse> {
      requests.push(request);
      const reply = replies.shift();
      if (!reply) throw new Error('Mock AI provider: no reply queued');
      if ('error' in reply) throw reply.error;
      if ('hang' in reply) {
        await new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () =>
            reject(new AiProviderError('timeout', 'Mock provider timed out')),
          );
        });
      }
      if ('text' in reply) return { text: reply.text, truncated: false };
      if (!('json' in reply)) throw new Error('Mock AI provider: bad reply');
      return {
        text: JSON.stringify(reply.json),
        inputTokens: reply.inputTokens ?? 100,
        outputTokens: reply.outputTokens ?? 50,
        truncated: reply.truncated ?? false,
      };
    },
  };

  return {
    provider,
    /** Queue answers in order. */
    reply: (...next: MockReply[]) => replies.push(...next),
    requests,
    /** Answers still queued (tests check that every one was used). */
    pending: () => replies.length,
  };
}
