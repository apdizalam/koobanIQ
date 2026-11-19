import { ApiError, FinishReason, GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from './provider.js';

/** The part of the SDK client we use (lets tests pass a fake). */
export interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<{
      text?: string;
      candidates?: { finishReason?: FinishReason | string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    }>;
  };
}

const KEY_PROBLEM = /API[_ ]KEY|api key|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i;

/**
 * Turns anything the SDK throws into an AiProviderError with a safe message
 * (no key, no prompt text), so the rest of the app never sees Gemini details.
 */
export function classifyGeminiError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new AiProviderError('timeout', 'Gemini did not answer in time');
  }
  const status =
    err instanceof ApiError
      ? err.status
      : typeof (err as { status?: unknown } | null)?.status === 'number'
        ? (err as { status: number }).status
        : undefined;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403 || (status === 400 && KEY_PROBLEM.test(message))) {
    return new AiProviderError('auth', `Gemini rejected the API key (HTTP ${status})`, status);
  }
  if (status === 429) {
    return new AiProviderError('quota', 'Gemini free-tier quota or rate limit reached', 429);
  }
  if (status === 408 || status === 504) {
    return new AiProviderError('timeout', `Gemini timed out (HTTP ${status})`, status);
  }
  if (status !== undefined && status >= 500) {
    return new AiProviderError('unavailable', `Gemini is unavailable (HTTP ${status})`, status);
  }
  if (status !== undefined && status >= 400) {
    return new AiProviderError(
      'bad_request',
      `Gemini rejected the request (HTTP ${status})`,
      status,
    );
  }
  // No status: network failure (DNS, offline, connection reset).
  return new AiProviderError('unavailable', 'Gemini could not be reached');
}

const BLOCKED: string[] = [
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
];

/**
 * Google Gemini API provider (free tier during development). Asks for JSON that
 * follows the given JSON Schema; aiService still checks every answer with Zod.
 */
export function createGeminiProvider(options: {
  apiKey: string;
  model: string;
  /** Tests only: a fake client instead of the real SDK. */
  client?: GeminiClient;
}): AiProvider {
  const client: GeminiClient = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });

  return {
    name: 'gemini',
    model: options.model,
    async generate(request: AiRequest): Promise<AiResponse> {
      try {
        const response = await client.models.generateContent({
          model: options.model,
          contents: [
            {
              role: 'user',
              parts: [
                ...(request.documents ?? []).map((doc) => ({
                  inlineData: { mimeType: doc.mimeType, data: doc.data },
                })),
                { text: request.prompt },
              ],
            },
          ],
          config: {
            systemInstruction: request.system,
            responseMimeType: 'application/json',
            responseJsonSchema: request.jsonSchema,
            maxOutputTokens: request.maxOutputTokens,
            temperature: request.temperature,
            abortSignal: request.signal,
          },
        });

        const finish = response.candidates?.[0]?.finishReason;
        if (response.promptFeedback?.blockReason || (finish && BLOCKED.includes(finish))) {
          throw new AiProviderError('blocked', 'Gemini declined to answer this content');
        }
        return {
          text: response.text ?? '',
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
          truncated: finish === FinishReason.MAX_TOKENS,
        };
      } catch (err) {
        // An abort from our own time limit is a timeout, whatever the SDK calls it.
        if (request.signal.aborted) {
          throw new AiProviderError('timeout', 'Gemini did not answer in time');
        }
        throw classifyGeminiError(err);
      }
    },
  };
}
