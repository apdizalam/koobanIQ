/**
 * The one interface every AI provider implements (Gemini today; another one
 * later without changing the AI features). Features call src/ai/aiService.ts,
 * never a provider directly.
 */

/** What can go wrong at the provider, in provider-neutral terms. */
export type AiErrorKind =
  /** The provider refused the API key (wrong, revoked or missing permissions). */
  | 'auth'
  /** Daily free-tier quota used up (HTTP 429, resets at midnight Pacific): not retried. */
  | 'quota'
  /** Too many requests per minute (HTTP 429): retried after a pause. */
  | 'rate_limited'
  /** No answer in time. */
  | 'timeout'
  /** Provider down, overloaded ("high demand", HTTP 503) or unreachable. */
  | 'unavailable'
  /** The provider declined to answer this content (safety). */
  | 'blocked'
  /** The request was rejected as malformed (a bug on our side). */
  | 'bad_request';

/** A provider failure. Its message never contains the API key or user content. */
export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    /** HTTP status from the provider, when there was one. */
    public readonly status?: number,
    /** Safe details for monitoring: the provider's status word and its suggested wait. */
    public readonly details: {
      /** e.g. "UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED" (never a message). */
      providerStatus?: string;
      /** The provider's "retry after" hint, in milliseconds. */
      retryAfterMs?: number;
    } = {},
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** A file sent with the request (job description PDFs, TIQ-8). */
export interface AiDocument {
  mimeType: 'application/pdf';
  /** Base64 content. */
  data: string;
}

export const AI_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type AiThinkingLevel = (typeof AI_THINKING_LEVELS)[number];

export interface AiRequest {
  /** Rules for the model (src/ai/prompts). */
  system: string;
  /** The task, with only the data it needs. */
  prompt: string;
  /** JSON Schema the answer must follow (made from the Zod schema). */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature?: number;
  /**
   * How much the model "thinks" before answering (Gemini 3.x thinks by default,
   * which makes answers slower). Undefined = the model's default.
   */
  thinkingLevel?: AiThinkingLevel;
  documents?: AiDocument[];
  /** Aborted when the time limit runs out. */
  signal: AbortSignal;
}

export interface AiResponse {
  /** The raw answer text (expected to be JSON; checked by aiService). */
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  /** True when the answer stopped at maxOutputTokens (so it is incomplete). */
  truncated: boolean;
}

export interface AiProvider {
  /** e.g. "gemini" (recorded in usageRecords). */
  readonly name: string;
  /** e.g. "gemini-3.1-flash-lite" (recorded in usageRecords). */
  readonly model: string;
  generate(request: AiRequest): Promise<AiResponse>;
}
