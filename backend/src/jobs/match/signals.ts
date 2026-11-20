import { SKILL_VOCABULARY } from './vocabulary.js';

/** Career levels, lowest first (TIQ-17). */
export const CAREER_LEVELS = ['entry', 'junior', 'intermediate', 'senior', 'expert'] as const;
export type CareerLevel = (typeof CAREER_LEVELS)[number];
export const levelRank = (level: CareerLevel) => CAREER_LEVELS.indexOf(level);

type SkillLevel = 'beginner' | 'mid' | 'advanced' | 'expert';

/** What the matcher knows about the user: only the user's own profile data. */
export interface UserSignals {
  skills: { name: string; selfLevel: SkillLevel; assessedLevel: SkillLevel | null }[];
  /** "YYYY-MM"; endDate empty = current job. */
  experience: { title: string; startDate: string; endDate?: string | null }[];
  /** Other evidence of a skill (named in a project or certificate). */
  projectSkills: string[];
  certifications: string[];
  headline: string | null;
  preferences: {
    titles: string[];
    regions: string[];
    cities: string[];
    employerTypes: string[];
    jobTypes: string[];
    workModes: string[];
  };
}

/** What the matcher reads from a job (only what the source gave). */
export interface JobSignalsInput {
  title: string;
  description?: string | null;
  region: string;
  city?: string | null;
  employerType: string;
  jobType?: string | null;
}

// ------------------------------------------------------------------ text helpers

/** Lower case, without accents; spaces kept. */
export const plainText = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A whole-word, case-free pattern for a skill name ("node.js", "c++", "m&e" included). */
function termPattern(term: string) {
  const body = plainText(term).trim().split(/\s+/).map(escapeRe).join('[\\s-]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}+#])`, 'gu');
}

/** Words some people leave out: "Microsoft Excel" = "Excel", "MS Word" = "Word". */
const VENDORS = /^(microsoft|ms|google|adobe|apple)\s+/;

/** The ways a skill name may be written in an ad. */
export function skillVariants(name: string) {
  const base = plainText(name).trim().replace(/\s+/g, ' ');
  const out = new Set([base]);
  const short = base.replace(VENDORS, '');
  if (short.length >= 2 && short !== base) out.add(short);
  return [...out];
}

export const sameSkill = (a: string, b: string) => {
  const va = skillVariants(a);
  return skillVariants(b).some((v) => va.includes(v));
};

// ------------------------------------------------------------------ the user

const monthIndex = (ym: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
};

/**
 * Years of work experience from the profile's own dates. Overlapping jobs count
 * once; a current job runs to today. Never estimated from age or degree.
 */
export function experienceYears(experience: UserSignals['experience'], now = new Date()) {
  const today = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans = experience
    .map((e) => {
      const start = monthIndex(e.startDate);
      const end = e.endDate ? monthIndex(e.endDate) : today;
      return start === null || end === null || end < start ? null : [start, end + 1];
    })
    .filter((s): s is number[] => s !== null)
    .sort((a, b) => a[0] - b[0]);
  let months = 0;
  let current: number[] | null = null;
  for (const span of spans) {
    if (!current || span[0] > current[1]) {
      if (current) months += current[1] - current[0];
      current = [...span];
    } else current[1] = Math.max(current[1], span[1]);
  }
  if (current) months += current[1] - current[0];
  return Math.round((months / 12) * 10) / 10;
}

/** Years → career level: < 1 entry, < 3 junior, < 6 intermediate, < 10 senior, else expert. */
export function levelForYears(years: number): CareerLevel {
  if (years < 1) return 'entry';
  if (years < 3) return 'junior';
  if (years < 6) return 'intermediate';
  if (years < 10) return 'senior';
  return 'expert';
}

/**
 * The user's career level from evidence: work experience first. Quiz evidence
 * can only lift an entry-level profile to junior (two skills assessed advanced
 * or expert); a self-rated level never changes it.
 */
export function userCareerLevel(user: UserSignals, now = new Date()) {
  const years = experienceYears(user.experience, now);
  let level = levelForYears(years);
  const strongAssessed = user.skills.filter(
    (s) => s.assessedLevel === 'advanced' || s.assessedLevel === 'expert',
  ).length;
  if (level === 'entry' && strongAssessed >= 2) level = 'junior';
  return { years, level };
}

// ------------------------------------------------------------------ the job

/** Seniority words in a job title, strongest first. */
const TITLE_LEVELS: [RegExp, CareerLevel][] = [
  [/\b(director|chief|head of|country representative|vice president|vp)\b/, 'expert'],
  [/\b(senior|sr\.?|lead|principal|manager|team leader)\b/, 'senior'],
  [/\b(junior|jr\.?|assistant|associate|trainee)\b/, 'junior'],
  [/\b(intern|internship|graduate|entry[- ]level|volunteer)\b/, 'entry'],
];

/** "3+ years", "minimum of 5 years", "at least two (2) years" → the smallest number asked for. */
const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
export function requiredYears(text: string): number | null {
  const plain = plainText(text);
  const re =
    /(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\(\d{1,2}\)\s*)?(?:\+|or more|plus)?\s*(?:-\s*\d{1,2}\s*)?years?(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|work|working)/g;
  let best: number | null = null;
  for (const m of plain.matchAll(re)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]];
    if (n !== undefined && n <= 30 && (best === null || n > best)) best = n;
  }
  return best;
}

/**
 * The job's level: the higher of what the title says and what the required
 * years mean. Unknown when the ad says neither (then it is not held against anyone).
 */
export function jobCareerLevel(job: JobSignalsInput): CareerLevel | null {
  const title = plainText(job.title);
  const fromTitle = TITLE_LEVELS.find(([re]) => re.test(title))?.[1] ?? null;
  const years = requiredYears(`${job.title}\n${job.description ?? ''}`);
  const fromYears = years === null ? null : levelForYears(years);
  if (fromTitle && fromYears) {
    return levelRank(fromTitle) >= levelRank(fromYears) ? fromTitle : fromYears;
  }
  return fromTitle ?? fromYears;
}

type Importance = 'essential' | 'desirable';

const DESIRABLE =
  /\b(desirable|preferred|preferably|an advantage|advantageous|an asset|a plus|nice to have|ideally|would be a bonus)\b/;
const ESSENTIAL = /\b(required|requirements?|must|essential|mandatory|minimum|necessary)\b/;

/**
 * Skills the job asks for, from the user's own skill names and the common skill
 * list, each marked essential or desirable from the ad's wording: a "desirable /
 * preferred / an advantage" line or section makes it desirable; everything else
 * the job names counts as essential.
 */
export function jobSkills(job: JobSignalsInput, userSkillNames: string[]) {
  const lines = plainText(`${job.title}\n${job.description ?? ''}`).split(/\n|(?<=[.;])\s+/);
  const terms = new Map<string, string>(); // variant → display name
  for (const name of userSkillNames) for (const v of skillVariants(name)) terms.set(v, name);
  for (const term of SKILL_VOCABULARY) if (!terms.has(term)) terms.set(term, term);

  const found = new Map<string, Importance>(); // display name → importance
  let section: Importance | null = null;
  for (const line of lines) {
    const isHeading = line.trim().length < 60 && /:\s*$|^[#*\s-]*[a-z ]+$/.test(line.trim());
    if (isHeading && DESIRABLE.test(line)) section = 'desirable';
    else if (isHeading && ESSENTIAL.test(line)) section = 'essential';
    else if (isHeading && /:\s*$/.test(line.trim())) section = null; // e.g. "Responsibilities:"
    const importance: Importance = DESIRABLE.test(line) ? 'desirable' : (section ?? 'essential');

    // Longer names first; a shorter name inside a longer one is not counted
    // ("security" inside "food security").
    const hits: { start: number; end: number; name: string }[] = [];
    for (const [variant, name] of [...terms].sort((a, b) => b[0].length - a[0].length)) {
      for (const m of line.matchAll(termPattern(variant))) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (!hits.some((h) => start >= h.start && end <= h.end)) hits.push({ start, end, name });
      }
    }
    for (const hit of hits) {
      // Essential wins if a skill is named both ways.
      if (found.get(hit.name) !== 'essential') found.set(hit.name, importance);
    }
  }
  return [...found].map(([name, importance]) => ({ name, importance }));
}
