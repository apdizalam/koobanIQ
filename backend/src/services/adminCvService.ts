import { Cv } from '../models/Cv.js';
import { JobDescription } from '../models/JobDescription.js';
import { User } from '../models/User.js';

export const CV_STATUSES = ['draft', 'approved', 'exported'] as const;
export type CvStatus = (typeof CV_STATUSES)[number];
export const isCvStatus = (v: unknown): v is CvStatus =>
  (CV_STATUSES as readonly unknown[]).includes(v);

/**
 * GET /admin/cvs (TIQ-33): every generated CV's status, newest first, read-only.
 * Never the CV's content (the user's personal data): only who, for which job
 * ad (title and company from the ad), language, version, status, how many
 * missing items it has, and the dates.
 */
export async function listCvs(query: { status?: CvStatus; page: number; limit: number }) {
  const filter = query.status ? { status: query.status } : {};
  const [docs, total, byStatus] = await Promise.all([
    Cv.find(filter, { content: 0 })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Cv.countDocuments(filter),
    Cv.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const [users, ads] = await Promise.all([
    User.find({ _id: { $in: docs.map((d) => d.userId) } }, { email: 1 }).lean(),
    JobDescription.find(
      { _id: { $in: docs.map((d) => d.jobDescriptionId) } },
      { extracted: 1 },
    ).lean(),
  ]);
  const emailOf = new Map(users.map((u) => [String(u._id), u.email]));
  const adOf = new Map(ads.map((a) => [String(a._id), a.extracted]));
  const count = (s: CvStatus) => byStatus.find((b) => b._id === s)?.n ?? 0;
  return {
    summary: { draft: count('draft'), approved: count('approved'), exported: count('exported') },
    items: docs.map((d) => {
      const ad = adOf.get(String(d.jobDescriptionId));
      return {
        id: String(d._id),
        userId: String(d.userId),
        email: emailOf.get(String(d.userId)) ?? null,
        jobTitle: ad?.title ?? null,
        company: ad?.company ?? null,
        language: d.language,
        version: d.version,
        status: d.status,
        missingInfo: (d.missingInfo ?? []).length,
        createdAt: d.createdAt,
        approvedAt: d.approvedAt ?? null,
        exportedAt: d.exportedAt ?? null,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  };
}
