import {
  jobCareerLevel,
  jobSkills,
  levelForYears,
  levelRank,
  plainText,
  relevantYears,
  requiredYears,
  sameSkill,
  userCareerLevel,
  type CareerLevel,
  type LevelConfidence,
  type JobSignalsInput,
  type UserSignals,
} from './signals.js';

/** TIQ-17 categories, best first. */
export const MATCH_CATEGORIES = ['strong', 'good', 'potential', 'gap'] as const;
export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export type LevelFit = 'fits' | 'stretch' | 'above' | 'below' | 'unknown';

/** One reason, as a translation key + values; the app shows it in the user's language. */
export interface MatchReason {
  key: string;
  values?: Record<string, string | number>;
}

export interface JobMatchResult {
  /** 0–100: how well the job fits the profile data. Not a chance of being hired. */
  score: number;
  category: MatchCategory;
  /** True when it belongs in the main results; false = "lower match", only shown on request. */
  recommended: boolean;
  matchedSkills: string[];
  missingRequired: string[];
  missingPreferred: string[];
  /** Null when there is no evidence to judge by. */
  userLevel: CareerLevel | null;
  levelConfidence: LevelConfidence;
  jobLevel: CareerLevel | null;
  levelFit: LevelFit;
  /** Years of experience related to this job, and what the ad asks for (null = not stated). */
  relevantYears: number;
  requiredYears: number | null;
  reasons: MatchReason[];
}

/** How much a skill counts as evidence: a quiz result more than the user's own rating. */
const EVIDENCE = { assessed: 1, self: 0.7 } as const;

/**
 * Scores one job for one user (TIQ-17), from the profile and the job ad only,
 * with every reason kept so the app can explain it:
 * - skills (50): essential skills count double; the user's assessed skills count
 *   fully, self-rated ones 70 %;
 * - career level (25): fits / a step above (stretch) / far above (0); the
 *   user's level comes from evidence and says how sure it is; the job's "X years"
 *   is checked against the user's related experience;
 * - location (15): the selected regions and the user's cities;
 * - preferences (10): wanted titles, employer types, job types.
 * A job far above the user's level, or missing more than one essential skill,
 * is never "recommended", whatever the score.
 */
export function matchJob(
  user: UserSignals,
  job: JobSignalsInput,
  context: { regions: string[]; now?: Date },
): JobMatchResult {
  const reasons: MatchReason[] = [];
  const career = userCareerLevel(user, context.now);
  const userLevel = career.level;
  const jobLevel = jobCareerLevel(job);
  const required = requiredYears(`${job.title}\n${job.description ?? ''}`);

  // ---------------------------------------------------------------- skills
  const userNames = [...user.skills.map((s) => s.name), ...user.projectSkills];
  const asked = jobSkills(job, userNames);
  const evidenceFor = (name: string) => {
    const skill = user.skills.find((s) => sameSkill(s.name, name));
    if (skill?.assessedLevel) return EVIDENCE.assessed;
    if (skill) return EVIDENCE.self;
    if (user.projectSkills.some((p) => sameSkill(p, name))) return EVIDENCE.self;
    return 0;
  };
  const matchedSkills: string[] = [];
  const missingRequired: string[] = [];
  const missingPreferred: string[] = [];
  let earned = 0;
  let possible = 0;
  for (const { name, importance } of asked) {
    const weight = importance === 'essential' ? 2 : 1;
    const evidence = evidenceFor(name);
    possible += weight;
    earned += weight * evidence;
    if (evidence > 0) matchedSkills.push(name);
    else if (importance === 'essential') missingRequired.push(name);
    else missingPreferred.push(name);
  }

  let skillScore: number;
  if (possible > 0) {
    skillScore = 50 * (earned / possible);
    if (matchedSkills.length > 0) {
      reasons.push({ key: 'skillsMatched', values: { skills: matchedSkills.join(', ') } });
    }
    const assessed = matchedSkills.filter((n) => evidenceFor(n) === EVIDENCE.assessed);
    if (assessed.length > 0) {
      reasons.push({ key: 'skillsAssessed', values: { skills: assessed.join(', ') } });
    }
    if (missingRequired.length > 0) {
      reasons.push({ key: 'skillsMissing', values: { skills: missingRequired.join(', ') } });
    }
  } else {
    // The ad names no skill we can check: only the title can speak for it.
    skillScore = titleMatches(user, job.title) ? 30 : 15;
    reasons.push({ key: 'skillsNotStated' });
  }

  // ---------------------------------------------------------------- career level
  const related = relevantYears(
    user,
    job,
    asked.map((s) => s.name),
    context.now,
  );
  let levelFit: LevelFit = 'unknown';
  let levelScore = 15;
  if (!userLevel) {
    // No evidence about the user: the level is neither held for nor against them.
    reasons.push({ key: 'levelUnknown' });
  } else if (jobLevel) {
    const gap = levelRank(jobLevel) - levelRank(userLevel);
    if (gap <= 0 && gap >= -1) {
      levelFit = 'fits';
      levelScore = 25;
    } else if (gap < -1) {
      levelFit = 'below';
      levelScore = 18;
    } else if (gap === 1) {
      levelFit = 'stretch';
      levelScore = 10;
    } else {
      levelFit = 'above';
      levelScore = 0;
    }
    // The ad's "X years": counted against the user's related experience only.
    if (required !== null) {
      const short = levelRank(levelForYears(required)) - levelRank(levelForYears(related));
      if (short >= 2 && levelFit !== 'above') {
        levelFit = 'above';
        levelScore = 0;
      } else if (short === 1 && (levelFit === 'fits' || levelFit === 'below')) {
        levelFit = 'stretch';
        levelScore = 10;
      }
    }
    if (career.confidence === 'estimated' && levelFit === 'fits') levelScore = 20;
    reasons.push({
      key: `level_${levelFit}`,
      values: { jobLevel, userLevel, years: career.years },
    });
    if (required !== null && related < required) {
      reasons.push({ key: 'relevantYearsShort', values: { required, related } });
    }
  } else {
    reasons.push({ key: 'levelNotStated' });
  }
  if (userLevel && career.confidence === 'estimated') {
    reasons.push({ key: 'levelEstimated' });
  }

  // ---------------------------------------------------------------- location
  let locationScore = 0;
  const regions = context.regions.length ? context.regions : user.preferences.regions;
  if (job.region !== 'remote' && regions.includes(job.region)) {
    locationScore += 10;
    reasons.push({ key: 'inRegion', values: { region: job.region } });
  } else if (job.region === 'remote') {
    locationScore += 8;
    reasons.push({ key: 'remote' });
  }
  if (
    job.city &&
    user.preferences.cities.some((c) => plainText(c).trim() === plainText(job.city!).trim())
  ) {
    locationScore += 5;
    reasons.push({ key: 'inCity', values: { city: job.city } });
  }

  // ---------------------------------------------------------------- preferences
  let prefScore = 0;
  if (titleMatches(user, job.title)) {
    prefScore += 6;
    reasons.push({ key: 'titleWanted' });
  }
  if (user.preferences.employerTypes.includes(job.employerType)) prefScore += 2;
  if (job.jobType && user.preferences.jobTypes.includes(job.jobType)) prefScore += 2;

  const score = Math.round(Math.min(100, skillScore + levelScore + locationScore + prefScore));
  const category: MatchCategory =
    score >= 75 ? 'strong' : score >= 60 ? 'good' : score >= 45 ? 'potential' : 'gap';

  // Never pushed: far above the level, or more than one essential skill missing
  // (a step above only with no essential skill missing).
  const recommended =
    category !== 'gap' &&
    levelFit !== 'above' &&
    missingRequired.length <= (levelFit === 'stretch' ? 0 : 1);
  if (!recommended) {
    reasons.push({
      key:
        levelFit === 'above'
          ? 'notRecommendedLevel'
          : missingRequired.length > 0
            ? 'notRecommendedSkills'
            : 'notRecommendedFit',
    });
  }

  return {
    score,
    category,
    recommended,
    matchedSkills,
    missingRequired,
    missingPreferred,
    userLevel,
    levelConfidence: career.confidence,
    jobLevel,
    levelFit,
    relevantYears: related,
    requiredYears: required,
    reasons,
  };
}

/** The job title shares a real word with a wanted title or the user's headline. */
function titleMatches(user: UserSignals, title: string) {
  const words = (text: string) =>
    plainText(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const jobWords = new Set(words(title));
  return [...user.preferences.titles, ...(user.headline ? [user.headline] : [])].some((t) =>
    words(t).some((w) => jobWords.has(w)),
  );
}

/** Title words that say nothing about the kind of work. */
const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'senior',
  'junior',
  'assistant',
  'associate',
  'officer',
  'manager',
  'lead',
  'head',
  'intern',
  'national',
  'international',
  'consultant',
  'staff',
]);
