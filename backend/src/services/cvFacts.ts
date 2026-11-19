import type { AiLanguage } from '../ai/schemas/common.js';
import type { CvAnswer } from '../ai/schemas/cv.js';
import type { toPublicJobDescription } from '../models/JobDescription.js';
import type { toPublicProfile } from '../models/Profile.js';
import type { toPublicSkill } from '../models/Skill.js';

type PublicProfile = ReturnType<typeof toPublicProfile>;
type PublicSkill = ReturnType<typeof toPublicSkill>;
type JobFacts = ReturnType<typeof toPublicJobDescription>['extracted'];
type Item = Record<string, unknown> & { id: string };

/**
 * What the AI may see for a CV (TIQ-9). Data minimisation: never the name,
 * email, phone, city, employer names, school names, issuers or links. Those
 * are added to the finished CV by code (assembleCv), never by the AI.
 */
export interface CvAiInput {
  target: {
    title: string | null;
    requiredSkills: string[];
    preferredSkills: string[];
    responsibilities: string[];
    qualifications: string[];
    education: string[];
    experience: string[];
    keywords: string[];
  };
  profile: {
    headline: string | null;
    profession: string | null;
    summary: string | null;
    experience: {
      id: string;
      title: string;
      startDate: string;
      endDate: string | null;
      description: string | null;
    }[];
    education: {
      id: string;
      degree: string | null;
      field: string | null;
      startYear: number | null;
      endYear: number | null;
    }[];
    projects: { id: string; name: string; description: string | null; skills: string[] }[];
    certifications: { id: string; name: string; issuedOn: string | null }[];
    languages: { id: string; language: string; level: string }[];
    skills: {
      name: string;
      selfLevel: string;
      assessedLevel: string | null;
      yearsExp: number | null;
    }[];
  };
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
const num = (value: unknown) => (typeof value === 'number' ? value : null);

export function prepareCvInput(
  profile: PublicProfile,
  skills: PublicSkill[],
  job: JobFacts,
): CvAiInput {
  const p = profile.personal as Record<string, unknown>;
  const items = (list: unknown) => list as Item[];
  return {
    target: {
      title: job.title,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      education: job.education,
      experience: job.experience,
      keywords: job.keywords,
    },
    profile: {
      headline: str(p.headline),
      profession: str(p.profession),
      summary: str(p.summary),
      experience: items(profile.experience).map((e) => ({
        id: e.id,
        title: String(e.title),
        startDate: String(e.startDate),
        endDate: str(e.endDate),
        description: str(e.description),
      })),
      education: items(profile.education).map((e) => ({
        id: e.id,
        degree: str(e.degree),
        field: str(e.field),
        startYear: num(e.startYear),
        endYear: num(e.endYear),
      })),
      projects: items(profile.projects).map((e) => ({
        id: e.id,
        name: String(e.name),
        description: str(e.description),
        skills: Array.isArray(e.skills) ? (e.skills as string[]) : [],
      })),
      certifications: items(profile.certifications).map((e) => ({
        id: e.id,
        name: String(e.name),
        issuedOn: str(e.issuedOn),
      })),
      languages: items(profile.languages).map((e) => ({
        id: e.id,
        language: String(e.language),
        level: String(e.level),
      })),
      skills: skills.map((s) => ({
        name: s.name,
        selfLevel: s.selfLevel,
        assessedLevel: s.assessedLevel,
        yearsExp: s.yearsExp,
      })),
    },
  };
}

const lower = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `text` mentions `term` as a whole word or phrase (any letter case). */
export function mentions(text: string, term: string) {
  const t = lower(term);
  if (!t) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(t)}($|[^\\p{L}\\p{N}])`, 'u').test(
    lower(text),
  );
}

/** Everything the user wrote in the part of the profile the AI sees (for claim checks). */
export function profileText(input: CvAiInput) {
  return JSON.stringify(input.profile);
}

/** Job skills the user does not have (not a skill, and not mentioned anywhere in the profile). */
export function skillsNotInProfile(input: CvAiInput, jobSkills: string[]) {
  const text = profileText(input);
  const own = input.profile.skills.map((s) => lower(s.name));
  return jobSkills.filter((skill) => !own.includes(lower(skill)) && !mentions(text, skill));
}

export type MissingInfo = { type: MissingInfoType; item?: string };
export type MissingInfoType =
  | 'fullName'
  | 'headline'
  | 'phone'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'requiredSkill'
  | 'preferredSkill';

/**
 * What the profile lacks for this job (computed by code, never by the AI).
 * The app shows these so the user can add them and generate again.
 */
export function computeMissingInfo(
  profile: PublicProfile,
  input: CvAiInput,
  job: JobFacts,
): MissingInfo[] {
  const p = profile.personal as Record<string, unknown>;
  const missing: MissingInfo[] = [];
  if (!str(p.fullName)) missing.push({ type: 'fullName' });
  if (!str(p.headline)) missing.push({ type: 'headline' });
  if (!str(p.phone)) missing.push({ type: 'phone' });
  if (input.profile.experience.length === 0) missing.push({ type: 'experience' });
  if (input.profile.education.length === 0) missing.push({ type: 'education' });
  if (input.profile.skills.length === 0) missing.push({ type: 'skills' });
  if (input.profile.languages.length === 0) missing.push({ type: 'languages' });
  for (const skill of skillsNotInProfile(input, job.requiredSkills)) {
    missing.push({ type: 'requiredSkill', item: skill });
  }
  for (const skill of skillsNotInProfile(input, job.preferredSkills)) {
    missing.push({ type: 'preferredSkill', item: skill });
  }
  return missing;
}

/** True when there is nothing to build a CV from. */
export function profileIsEmpty(input: CvAiInput) {
  const p = input.profile;
  return (
    p.experience.length === 0 &&
    p.education.length === 0 &&
    p.projects.length === 0 &&
    p.skills.length === 0
  );
}

/**
 * The finished CV: every fact (name, contact, employers, titles, dates,
 * schools, degrees, certificates, languages, skill levels) comes from the
 * profile by id; only the headline, summary and bullet points are AI text.
 */
export function assembleCv(
  profile: PublicProfile,
  skills: PublicSkill[],
  answer: CvAnswer,
  contact: { email: string },
  language: AiLanguage,
) {
  const p = profile.personal as Record<string, unknown>;
  const byId = (list: unknown) => new Map((list as Item[]).map((item) => [item.id, item]));
  const experience = byId(profile.experience);
  const education = byId(profile.education);
  const projects = byId(profile.projects);
  const certifications = byId(profile.certifications);
  const languages = byId(profile.languages);
  const skillByName = new Map(skills.map((s) => [lower(s.name), s]));

  return {
    language,
    header: {
      fullName: str(p.fullName),
      headline: answer.headline,
      city: str(p.city),
      region: str(p.region),
      email: contact.email,
      phone: str(p.phone),
    },
    summary: answer.summary,
    skills: answer.skills.map((name) => {
      const skill = skillByName.get(lower(name))!;
      return {
        name: skill.name,
        level: skill.assessedLevel ?? skill.selfLevel,
        assessed: skill.assessedLevel !== null,
      };
    }),
    experience: answer.experience.map(({ id, bullets }) => {
      const e = experience.get(id)!;
      return {
        id,
        title: String(e.title),
        employer: String(e.employer),
        city: str(e.city),
        startDate: String(e.startDate),
        endDate: str(e.endDate),
        bullets,
      };
    }),
    education: answer.education.map(({ id }) => {
      const e = education.get(id)!;
      return {
        id,
        school: String(e.school),
        degree: str(e.degree),
        field: str(e.field),
        startYear: num(e.startYear),
        endYear: num(e.endYear),
      };
    }),
    projects: answer.projects.map(({ id, bullets }) => {
      const e = projects.get(id)!;
      return { id, name: String(e.name), url: str(e.url), bullets };
    }),
    certifications: answer.certifications.map(({ id }) => {
      const e = certifications.get(id)!;
      return { id, name: String(e.name), issuer: str(e.issuer), issuedOn: str(e.issuedOn) };
    }),
    languages: answer.languages.map(({ id }) => {
      const e = languages.get(id)!;
      return { id, language: String(e.language), level: String(e.level) };
    }),
  };
}

export type AssembledCv = ReturnType<typeof assembleCv>;
