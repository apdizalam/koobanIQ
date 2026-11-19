import { z } from 'zod';

/** Languages the AI writes in (same as the app languages). */
export const aiLanguage = z.enum(['en', 'so']);
export type AiLanguage = z.infer<typeof aiLanguage>;

/**
 * Zod schema → JSON Schema for the provider's structured output. The answer is
 * still checked with the Zod schema itself: the JSON Schema only guides the model.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  // "$schema" names the JSON Schema version; the provider does not need it.
  delete json.$schema;
  return json;
}
