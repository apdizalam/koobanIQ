import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const list = (maxItems: number, maxLength: number) => z.array(text(maxLength)).max(maxItems);

/** Job types (same values as the profile's job preferences). */
export const JD_JOB_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'internship',
  'volunteer',
] as const;

/**
 * What the AI extracts from a job description (TIQ-8, architecture doc §7
 * jobDescriptions.extracted). Strict: unknown keys make the answer invalid.
 * Anything the ad does not say is null or an empty list, never guessed.
 */
export const jobDescriptionExtractionSchema = z
  .object({
    /** False when the input is not a job description at all (then the rest is empty). */
    isJobDescription: z.boolean(),
    /** Language the ad is written in. */
    language: z.enum(['en', 'so', 'other']),
    title: text(200).nullable(),
    company: text(200).nullable(),
    location: text(200).nullable(),
    jobType: z.enum(JD_JOB_TYPES).nullable(),
    requiredSkills: list(40, 100),
    preferredSkills: list(40, 100),
    education: list(15, 300),
    experience: list(15, 300),
    responsibilities: list(40, 400),
    qualifications: list(30, 400),
    /** Application deadline as YYYY-MM-DD, only when the ad states a date. */
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    /** Important words for matching (from the ad). */
    keywords: list(30, 60),
  })
  .strict();

export type JobDescriptionExtraction = z.infer<typeof jobDescriptionExtractionSchema>;
