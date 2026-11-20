import type { AiLanguage } from '../schemas/common.js';
import type { InterviewType } from '../schemas/interview.js';
import { asData, baseRules, type BuiltPrompt } from './shared.js';

/** Facts about the job the practice is for (never the user's profile). */
export interface InterviewTarget {
  /** Job title the user typed, or the job ad's title. */
  role: string;
  /** From a saved job ad or a stored job (job_specific): employer, skills, duties. */
  employer?: string | null;
  skills?: string[];
  responsibilities?: string[];
}

const TYPE_TASK: Record<InterviewType, string> = {
  general:
    'common interview questions any employer asks (motivation, strengths, why this job, goals)',
  technical: 'technical questions that test the knowledge and skills this job needs',
  behavioral:
    'behavioural questions about past situations ("Tell me about a time when…") that show teamwork, responsibility, communication and handling problems',
  job_specific:
    'questions an interviewer for this exact job would ask, based on its duties and required skills',
  problem_solving:
    'short practical scenarios from this kind of work; the candidate explains how they would solve the problem',
};

function targetText(target: InterviewTarget) {
  return [
    `Job title: ${target.role}`,
    target.employer ? `Employer: ${target.employer}` : '',
    target.skills?.length ? `Skills the job asks for: ${target.skills.join(', ')}` : '',
    target.responsibilities?.length
      ? `Main duties:\n- ${target.responsibilities.slice(0, 10).join('\n- ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * TIQ-19: the questions for one practice session. Only the job title and the
 * job's facts are sent; nothing from the user's profile.
 */
export function interviewQuestionsPrompt(input: {
  type: InterviewType;
  target: InterviewTarget;
  count: number;
  language: AiLanguage;
}): BuiltPrompt {
  return {
    system: baseRules(input.language),
    prompt: [
      `Write ${input.count} interview practice questions: ${TYPE_TASK[input.type]}.`,
      '- Realistic for employers in Somaliland and Somalia (companies, NGOs, UN agencies, government, education, health).',
      '- One clear question each, answerable in a few sentences of text. Different questions; easier ones first.',
      '- No questions about religion, clan, ethnicity, age, marital status, health or other protected matters.',
      '- "focus": two to five words naming what a good answer shows.',
      asData('job', targetText(input.target)),
    ].join('\n'),
  };
}

/**
 * TIQ-19: feedback on one typed answer. Sends the question, the job facts and
 * the answer only. The answer is the user's own text (owner decision: open to
 * all users, with a warning not to type personal details).
 */
export function interviewFeedbackPrompt(input: {
  type: InterviewType;
  target: InterviewTarget;
  question: string;
  answer: string;
  language: AiLanguage;
}): BuiltPrompt {
  return {
    system: baseRules(input.language),
    prompt: [
      'You are a fair, encouraging interview coach. Give feedback on the candidate’s answer to this practice question.',
      '- "score": 0–10 for how well this answer would work in a real interview for this job (0 = empty or off-topic, 5 = acceptable, 10 = excellent). Judge the answer, never the person.',
      '- "summary": one or two sentences.',
      '- "strengths" and "improvements": up to three short points each, about this answer only.',
      '- "betterAnswer": a short outline of a stronger answer (structure and what to mention). Do not invent facts about the candidate; use placeholders like "[your example]".',
      '- If the answer is not a real attempt (empty, nonsense, or another language than the question), score it 0–2 and say so kindly.',
      asData('job', targetText(input.target)),
      asData('question', input.question),
      asData('answer', input.answer),
    ].join('\n'),
  };
}
