import type { CvAiInput } from '../../services/cvFacts.js';
import type { AiLanguage } from '../schemas/common.js';
import { asData, baseRules, type BuiltPrompt } from './shared.js';

const LANGUAGE_NAMES: Record<AiLanguage, string> = { en: 'English', so: 'Somali (af-Soomaali)' };

/**
 * TIQ-9 prompt. The AI selects and orders the user's own entries by id for the
 * target job and writes the headline, summary and bullet points in the chosen
 * CV language. It never writes employers, titles, dates, schools or degrees:
 * those are filled in from the profile by code.
 */
export function cvPrompt(input: CvAiInput, language: AiLanguage): BuiltPrompt {
  return {
    system: baseRules(language),
    prompt: [
      `Write a CV for the target job in ${LANGUAGE_NAMES[language]}, using ONLY the candidate profile.`,
      "- headline: the candidate's preferred title or most relevant job title from the profile, worded for the target job.",
      '- summary: 2 to 4 sentences about the candidate, based only on profile facts.',
      '- skills: choose the most relevant skills by their exact names from profile.skills.',
      "- experience: choose relevant entries by id (most relevant first); 2 to 5 bullets each, rewritten from that entry's description only. If it has no description, give 0 or 1 bullet based on its title.",
      '- projects: same as experience, at most 4 bullets each.',
      '- education, certifications, languages: choose by id.',
      'Rules: never add employers, job titles, dates, degrees, schools, certificates, skills, numbers, achievements or tools that are not in the profile. Do not copy requirements from the target job as if the candidate had them. Use numbers only exactly as they appear in the profile.',
      asData('target_job', JSON.stringify(input.target, null, 1)),
      asData('candidate_profile', JSON.stringify(input.profile, null, 1)),
    ].join('\n'),
  };
}
