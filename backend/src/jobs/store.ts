import { createHash } from 'node:crypto';
import type { Types } from 'mongoose';
import { Job } from '../models/Job.js';
import { JOB_TYPES, WORK_MODES } from '../models/Profile.js';
import type { NormalizedJob } from './sources/types.js';

/** Longest description kept per job (the full ad stays on the source). */
const DESCRIPTION_MAX = 5000;

/** Text compared without case, accents, punctuation or extra spaces. */
const plain = (text: string | undefined) =>
  (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The same job, however a source writes it: title, employer, region and city
 * compared as plain text. Used to store each job once (TIQ-16 End Test).
 */
export function jobHash(job: Pick<NormalizedJob, 'title' | 'employer' | 'region' | 'city'>) {
  return createHash('sha256')
    .update([plain(job.title), plain(job.employer), job.region, plain(job.city)].join('|'))
    .digest('hex');
}

/**
 * Stores the valid jobs of one source. A job already stored (same source and
 * id, or the same job by hash, also from another source) is not stored again:
 * it counts as a duplicate, gets this source added and `lastSeenAt` updated.
 * Returns the stored job ids in the order given, without repeats.
 */
export async function saveJobs(jobs: NormalizedJob[]) {
  const ids: Types.ObjectId[] = [];
  const seen = new Set<string>();
  let created = 0;
  let duplicates = 0;
  const now = new Date();

  for (const job of jobs) {
    const hash = jobHash(job);
    const ref = { sourceKey: job.sourceKey, externalId: job.externalId, applyUrl: job.applyUrl };
    // The same source may change its job (title, deadline, place); its own id still finds it.
    const bySource = await Job.findOne(
      { sources: { $elemMatch: { sourceKey: job.sourceKey, externalId: job.externalId } } },
      { _id: 1, sourceKey: 1, externalId: 1 },
    );
    // The job's main source is the authority on its details: they follow its latest version.
    const isMain = bySource?.sourceKey === job.sourceKey && bySource?.externalId === job.externalId;
    const result = bySource
      ? {
          doc: await Job.findByIdAndUpdate(
            bySource._id,
            { $set: { lastSeenAt: now, ...(isMain ? details(job) : {}) } },
            { returnDocument: 'after' },
          ),
          inserted: false,
        }
      : await upsertByHash(hash, job, ref, now);
    const doc = result.doc!;
    if (
      !result.inserted &&
      !doc.sources.some((s) => s.sourceKey === job.sourceKey && s.externalId === job.externalId)
    ) {
      await Job.updateOne({ _id: doc._id }, { $push: { sources: ref } });
    }

    const key = String(doc._id);
    if (seen.has(key) || !result.inserted) duplicates += 1;
    else created += 1;
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(doc._id);
    }
  }
  return { ids, created, duplicates };
}

/** The details a source gives for a job (stored as given, trimmed). */
function details(job: NormalizedJob) {
  return {
    applyUrl: job.applyUrl,
    title: job.title.trim(),
    employer: job.employer.trim(),
    employerType: job.employerType,
    region: job.region,
    city: job.city?.trim() || undefined,
    // Kept only when it is one of our values (a source may send anything).
    jobType: (JOB_TYPES as readonly unknown[]).includes(job.jobType) ? job.jobType : undefined,
    workMode: (WORK_MODES as readonly unknown[]).includes(job.workMode) ? job.workMode : undefined,
    deadline: job.deadline,
    postedAt: job.postedAt,
    language: job.language,
    description: job.description?.slice(0, DESCRIPTION_MAX),
  };
}

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/** Two searches saving the same new job at once: the second simply finds the first. */
async function upsertByHash(
  hash: string,
  job: NormalizedJob,
  ref: { sourceKey: string; externalId: string; applyUrl: string },
  now: Date,
) {
  try {
    return await upsertOnce(hash, job, ref, now);
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return upsertOnce(hash, job, ref, now);
  }
}

async function upsertOnce(
  hash: string,
  job: NormalizedJob,
  ref: { sourceKey: string; externalId: string; applyUrl: string },
  now: Date,
) {
  const res = await Job.findOneAndUpdate(
    { hash },
    {
      $setOnInsert: {
        hash,
        sourceKey: job.sourceKey,
        externalId: job.externalId,
        sources: [ref],
        ...details(job),
        firstSeenAt: now,
      },
      $set: { lastSeenAt: now },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true },
  );
  return { doc: res.value, inserted: !res.lastErrorObject?.updatedExisting };
}
