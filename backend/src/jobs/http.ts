import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Fetching public web pages and APIs for job research (TIQ-32/16), safely:
 * - only http(s), no user name / password in the link, standard ports only;
 * - never a private, loopback or internal address (checked after DNS, and again
 *   on every redirect; at most 3 redirects), so a link can't reach the server's
 *   own network;
 * - a time limit and a size limit; an honest User-Agent that robots.txt can match.
 */
export const USER_AGENT = 'KOBANIQ-JobResearch/1.0';

export const httpSettings = {
  timeoutMs: 15_000,
  /** Web pages. */
  maxBytes: 3 * 1024 * 1024,
  /** Official job-board APIs can be big for large employers (one real Lever answer: 5.9 MB). */
  maxApiBytes: 12 * 1024 * 1024,
  maxRedirects: 3,
  /** Tests only: allow local test servers (127.0.0.1). Never set in the app. */
  allowPrivateForTests: false,
};

export class UnsafeUrlError extends Error {
  constructor(readonly reason: string) {
    super(`This link can't be used: ${reason}`);
  }
}

/** IPv4 / IPv6 addresses that are not on the public internet. */
export function isPrivateAddress(address: string) {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    if (ip === '::' || ip === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip);
  }
  return true;
}

/** The link's form only (no network): http(s), no credentials, standard port, a real host name. */
export function checkUrlForm(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid web address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeUrlError('only http and https links');
  }
  if (url.username || url.password) throw new UnsafeUrlError('no user name or password in links');
  if (url.port && url.port !== '80' && url.port !== '443' && !httpSettings.allowPrivateForTests) {
    throw new UnsafeUrlError('only standard web ports');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!httpSettings.allowPrivateForTests) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new UnsafeUrlError('not a public web address');
    }
    if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError('not a public web address');
    if (!isIP(host) && !host.includes('.')) throw new UnsafeUrlError('not a public web address');
  }
  return url;
}

/** Every address the host name points to must be public. */
async function checkResolvesPublic(url: URL) {
  if (httpSettings.allowPrivateForTests) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError('not a public web address');
  }
}

/**
 * GET a public URL with the checks above. Returns status, final URL, content
 * type and the body as text (cut at maxBytes). Throws UnsafeUrlError for links
 * that are not allowed, Error for network problems.
 */
export async function safeGet(
  raw: string,
  accept = 'text/html,application/json;q=0.9,*/*;q=0.5',
  maxBytes = httpSettings.maxBytes,
) {
  let url = checkUrlForm(raw);
  for (let hop = 0; hop <= httpSettings.maxRedirects; hop += 1) {
    await checkResolvesPublic(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), httpSettings.timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = checkUrlForm(new URL(res.headers.get('location')!, url).toString());
        continue;
      }
      const { body, truncated } = await readLimited(res, maxBytes);
      return {
        status: res.status,
        url: url.toString(),
        contentType: res.headers.get('content-type') ?? '',
        body,
        truncated,
      };
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new Error(`No answer within ${httpSettings.timeoutMs / 1000} s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Too many redirects');
}

async function readLimited(res: Response, maxBytes: number) {
  if (!res.body) return { body: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks).toString('utf8'), truncated };
}

/** GET JSON from an official API (same safety checks). */
export async function getJson<T>(url: string): Promise<T> {
  const res = await safeGet(url, 'application/json', httpSettings.maxApiBytes);
  if (res.status !== 200) throw new Error(`The source answered ${res.status}`);
  if (res.truncated) throw new Error('The answer from the source is too large to read');
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new Error('The source did not answer with valid JSON');
  }
}

// ------------------------------------------------------------------ robots.txt

type Rule = { allow: boolean; path: string };
const robotsCache = new Map<string, { at: number; rules: Rule[] | 'all' | 'none' }>();
const ROBOTS_TTL_MS = 60 * 60 * 1000;

/** Rules of the group that applies to us (our name, else "*"), RFC 9309. */
export function parseRobots(text: string, agent = 'kobaniq-jobresearch'): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === 'allow', path: value });
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.startsWith(a)));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/** Longest matching rule wins; Allow wins a tie; nothing matching = allowed. */
export function robotsAllowPath(rules: Rule[], path: string) {
  let best: Rule | null = null;
  for (const rule of rules) {
    const pattern = new RegExp(
      `^${rule.path
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$$/, '$')}`,
    );
    if (pattern.test(path)) {
      if (
        !best ||
        rule.path.length > best.path.length ||
        (rule.path.length === best.path.length && rule.allow)
      ) {
        best = rule;
      }
    }
  }
  return best ? best.allow : true;
}

/**
 * May we fetch this page? robots.txt is respected (RFC 9309): no robots.txt
 * (4xx) = allowed; robots.txt unreachable (5xx / network) = not allowed.
 */
export async function robotsAllows(raw: string) {
  const url = checkUrlForm(raw);
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > ROBOTS_TTL_MS) {
    let rules: Rule[] | 'all' | 'none';
    try {
      const res = await safeGet(`${origin}/robots.txt`, 'text/plain');
      if (res.status >= 400 && res.status < 500) rules = 'all';
      else if (res.status >= 500) rules = 'none';
      else rules = parseRobots(res.body);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      rules = 'none';
    }
    entry = { at: Date.now(), rules };
    robotsCache.set(origin, entry);
  }
  if (entry.rules === 'all') return true;
  if (entry.rules === 'none') return false;
  return robotsAllowPath(entry.rules, url.pathname + url.search);
}

/** Tests only: forget cached robots.txt files. */
export const clearRobotsCache = () => robotsCache.clear();
