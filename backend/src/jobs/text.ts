import { Region, type RegionKey } from '../models/Region.js';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  bull: '•',
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** HTML (possibly entity-escaped, as some APIs send it) → plain text with line breaks. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return '';
  let text = decodeEntities(html); // escaped HTML ("&lt;p&gt;") becomes real tags first
  text = text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const plain = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

let cache: { at: number; cities: Record<RegionKey, string[]> } | null = null;

/** The admin-managed city lists (cached for 10 minutes). */
async function regionCities() {
  if (!cache || Date.now() - cache.at > 10 * 60 * 1000) {
    const regions = await Region.find().lean();
    const cities = { somaliland: [], somalia: [], remote: [] } as Record<RegionKey, string[]>;
    for (const r of regions) cities[r.key as RegionKey] = r.cities ?? [];
    cache = { at: Date.now(), cities };
  }
  return cache.cities;
}

/** Tests only. */
export const clearRegionCache = () => {
  cache = null;
};

/**
 * Which of our regions a job's location belongs to, from what the source says:
 * Somaliland (the word or one of its cities), Somalia (the word or one of its
 * cities), remote (stated as remote / anywhere). Anything else (another
 * country) → null, so the job is not kept (doc 9: Somaliland and Somalia first).
 */
export async function resolveRegion(
  location: string | null | undefined,
  remote = false,
): Promise<{ region: RegionKey; city?: string } | null> {
  const text = plain(location ?? '');
  const cities = await regionCities();
  const word = (w: string) => new RegExp(`(?<![\\p{L}])${plain(w)}(?![\\p{L}])`, 'u').test(text);
  for (const key of ['somaliland', 'somalia'] as const) {
    const city = cities[key].find((c) => word(c));
    if (city) return { region: key, city };
  }
  // "Somaliland" before "Somalia": the longer name is the more specific one.
  if (word('somaliland')) return { region: 'somaliland' };
  if (word('somalia')) return { region: 'somalia' };
  if ((remote || /\b(remote|work from home|anywhere|worldwide)\b/.test(text)) && openToUs(text)) {
    return { region: 'remote' };
  }
  return null;
}

/** Words that keep a remote job open to candidates in Somaliland / Somalia. */
const OPEN_WORDS =
  /\b(remote|fully|100%|work from home|wfh|anywhere|worldwide|global|globally|international|africa|east africa|emea|horn of africa)\b/g;

/**
 * A remote job is only "remote" for us when nothing restricts it to another
 * place: "Remote", "Remote - Worldwide", "Remote (Africa / EMEA)" yes;
 * "Remote, United States" or "Remote - Germany" no (shown nowhere, rather than
 * misleading a job seeker in Somalia).
 */
function openToUs(text: string) {
  const rest = text
    .replace(OPEN_WORDS, ' ')
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();
  return rest === '';
}
