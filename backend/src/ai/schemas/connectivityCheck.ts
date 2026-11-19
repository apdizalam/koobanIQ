import { z } from 'zod';
import { aiLanguage } from './common.js';

/**
 * Answer of the connectivity check (npm run ai:check and tests). Strict: any
 * extra property makes the answer invalid.
 */
export const connectivityCheckSchema = z
  .object({
    language: aiLanguage,
    /** One short sentence in the requested language. */
    sentence: z.string().min(1).max(300),
    /** The number of fruits named in the synthetic text. */
    fruitCount: z.number().int().min(0).max(20),
  })
  .strict();

export type ConnectivityCheck = z.infer<typeof connectivityCheckSchema>;
