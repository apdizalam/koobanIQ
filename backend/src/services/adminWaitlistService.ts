import { Waitlist } from '../models/Waitlist.js';

/** Longest search text taken (longer input is cut). */
export const WAITLIST_SEARCH_MAX = 100;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /admin/waitlist: the landing page waitlist for admins, newest first,
 * paged, searchable by email or name. Only what the form collected: email,
 * optional name, page language, when they agreed to the privacy policy, and
 * when they joined. `total` is everyone on the list; `matching` the search hits.
 */
export async function listWaitlist(query: { q?: string; page: number; limit: number }) {
  const q = (query.q ?? '').trim().slice(0, WAITLIST_SEARCH_MAX);
  const filter = q
    ? {
        $or: [
          { email: { $regex: escapeRegex(q), $options: 'i' } },
          { name: { $regex: escapeRegex(q), $options: 'i' } },
        ],
      }
    : {};
  const [docs, matching, total] = await Promise.all([
    Waitlist.find(filter, { email: 1, name: 1, language: 1, consentAt: 1, source: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    q ? Waitlist.countDocuments(filter) : null,
    Waitlist.countDocuments(),
  ]);
  return {
    total,
    matching: matching ?? total,
    items: docs.map((d) => ({
      id: String(d._id),
      email: d.email,
      name: d.name ?? null,
      language: d.language,
      consentAt: d.consentAt,
      source: d.source ?? 'landing',
      createdAt: d.createdAt,
    })),
    page: query.page,
    limit: query.limit,
  };
}
