import { z } from 'zod';

/** Languages the AI writes in (same as the app languages). */
export const aiLanguage = z.enum(['en', 'so']);
export type AiLanguage = z.infer<typeof aiLanguage>;

/**
 * Limits left out of the JSON Schema sent to the provider. Gemini refuses
 * schemas whose limits make them too complex ("too many states for serving",
 * found with the CV schema); the Zod schema still enforces every one of them
 * on our side, so nothing is lost.
 */
const LIMIT_KEYS = new Set([
  'maxItems',
  'minItems',
  'maxLength',
  'minLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'format',
]);

function withoutLimits(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutLimits);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !LIMIT_KEYS.has(key))
        .map(([key, inner]) => [key, withoutLimits(inner)]),
    );
  }
  return value;
}

/**
 * Zod schema → JSON Schema for the provider's structured output: structure,
 * required fields, allowed values and "no extra fields". The answer is then
 * checked with the full Zod schema (limits and custom checks included).
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  // "$schema" names the JSON Schema version; the provider does not need it.
  delete json.$schema;
  return withoutLimits(json) as Record<string, unknown>;
}
