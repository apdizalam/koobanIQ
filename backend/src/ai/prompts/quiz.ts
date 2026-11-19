import type { AiLanguage } from '../schemas/common.js';
import { BANK_PER_DIFFICULTY, OPTIONS_PER_QUESTION } from '../schemas/quiz.js';
import { asData, baseRules, type BuiltPrompt } from './shared.js';

/**
 * TIQ-13 prompt: a bank of multiple-choice questions for one skill. Only the
 * skill name is sent (no profile, no personal data). The questions test
 * knowledge, not experience (product rule).
 */
export function quizPrompt(input: { skill: string; language: AiLanguage }): BuiltPrompt {
  const total = BANK_PER_DIFFICULTY * 3;
  return {
    system: baseRules(input.language),
    prompt: [
      `Write ${total} multiple-choice questions that test knowledge of the skill below.`,
      `- Exactly ${BANK_PER_DIFFICULTY} questions at each difficulty: "easy", "normal", "hard".`,
      `- Use ${BANK_PER_DIFFICULTY} short topic names for this skill and give every topic one question at each difficulty, so a wrong answer can be followed by another question on the same topic. Use exactly the same topic name each time.`,
      `- Each question has exactly ${OPTIONS_PER_QUESTION} options; exactly one is correct ("answer" is its index, 0 to ${OPTIONS_PER_QUESTION - 1}). Wrong options must be plausible but clearly wrong for someone who knows the topic.`,
      '- Ask about general, well-established knowledge of the skill that a job seeker in Somaliland or Somalia could be asked about at work. No trick questions, no questions about a specific company, product version or person.',
      '- "explanation": one or two sentences on why the correct option is right.',
      '- Keep questions short and clear. Do not number them.',
      asData('skill', input.skill),
    ].join('\n'),
  };
}
