/**
 * The one interface every AI provider implements (Gemini today; another one
 * later without changing the AI features). Features call src/ai/aiService.ts,
 * never a provider directly.
 */

/** What can go wrong at the provider, in provider-neutral terms. */
export type AiErrorKind =
  /** The provider refused the API key (wrong, revoked or missing permissions). */
  | 'auth'
  /** Free-tier quota or rate limit reached (HTTP 429). */
  | 'quota'
  /** No answer in time. */
  | 'timeout'
  /** Provider down, overloaded or unreachable. */
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

export interface AiRequest {
  /** Rules for the model (src/ai/prompts). */
  system: string;
  /** The task, with only the data it needs. */
  prompt: string;
  /** JSON Schema the answer must follow (made from the Zod schema). */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature?: number;
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
