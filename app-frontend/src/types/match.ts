/** How well a job matches the user (Figma "MatchBadge" categories). */
export type MatchCategory = 'strong' | 'good' | 'potential' | 'gap';

/** A match result shown on a job: category, translated label and score 0–100. */
export interface JobMatch {
  category: MatchCategory;
  label: string;
  score: number;
}

/** Product rule 3: an assessed skill must always look different from a self-reported one. */
export type SkillStatus = 'assessed' | 'self-reported';
