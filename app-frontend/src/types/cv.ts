/** CV languages: the user picks one every time (never copied from the app language). */
export const CV_LANGUAGES = ['en', 'so'] as const;
export type CvLanguage = (typeof CV_LANGUAGES)[number];

/** What the AI read from a job ad (backend models/JobDescription.ts toPublicJobDescription). */
export interface JobFacts {
  language: 'en' | 'so' | 'other';
  title: string | null;
  company: string | null;
  location: string | null;
  jobType: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  education: string[];
  experience: string[];
  responsibilities: string[];
  qualifications: string[];
  /** "YYYY-MM-DD", only when the ad states it. */
  deadline: string | null;
  keywords: string[];
}

export interface JobDescription {
  id: string;
  source: 'text' | 'pdf';
  fileName: string | null;
  extracted: JobFacts;
  createdAt: string;
}

/** What the profile lacks for this job (computed by the server, never by the AI). */
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

export interface MissingInfo {
  type: MissingInfoType;
  /** The skill name for requiredSkill / preferredSkill. */
  item?: string;
}

/** The finished CV (backend services/cvFacts.ts assembleCv): every fact comes from the profile. */
export interface CvContent {
  language: CvLanguage;
  header: {
    fullName: string | null;
    headline: string;
    city: string | null;
    region: string | null;
    email: string;
    phone: string | null;
  };
  summary: string;
  skills: { name: string; level: string; assessed: boolean }[];
  experience: {
    id: string;
    title: string;
    employer: string;
    city: string | null;
    startDate: string;
    endDate: string | null;
    bullets: string[];
  }[];
  education: {
    id: string;
    school: string;
    degree: string | null;
    field: string | null;
    startYear: number | null;
    endYear: number | null;
  }[];
  projects: { id: string; name: string; url: string | null; bullets: string[] }[];
  certifications: { id: string; name: string; issuer: string | null; issuedOn: string | null }[];
  languages: { id: string; language: string; level: string }[];
}

export interface Cv {
  id: string;
  jobDescriptionId: string;
  language: CvLanguage;
  /** 1, 2, 3… per job ad and language (each generation is a new version). */
  version: number;
  status: 'draft' | 'approved' | 'exported';
  template: string;
  missingInfo: MissingInfo[];
  /** Left out in lists. */
  content?: CvContent;
  createdAt: string;
}
