import type { AiLanguage } from '../schemas/common.js';
import { asData, baseRules, type BuiltPrompt } from './shared.js';

/**
 * Connectivity check (npm run ai:check): a tiny task on synthetic text with no
 * personal data, to prove the key, model, JSON output and both languages work.
 */
export function connectivityCheckPrompt(language: AiLanguage): BuiltPrompt {
  return {
    system: baseRules(language),
    prompt: [
      'Read the text and answer with:',
      '- language: the code of the language you write in ("en" or "so"),',
      '- sentence: one short sentence describing the text,',
      '- fruitCount: how many different fruits the text names.',
      asData('text', 'The market stall sells mangoes, bananas and lemons every morning.'),
    ].join('\n'),
  };
}
