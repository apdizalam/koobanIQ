#!/usr/bin/env node
/**
 * Checks the built website in web-dist/ (TIQ-25), after `npm run build:web`:
 * every landing page and the admin are there, every page carries the
 * Content-Security-Policy, the admin is marked private for search engines and
 * loads only /admin files, and nothing loads from other servers.
 * Exit code 1 lists every problem.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_API_URL, contentSecurityPolicy } from './build-web.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web-dist');
const problems = [];
const fail = (text) => problems.push(text);
const read = (path) => readFileSync(join(out, path), 'utf8');

const LANDING_PAGES = [
  'index.html',
  'privacy/index.html',
  'terms/index.html',
  'so/index.html',
  'so/privacy/index.html',
  'so/terms/index.html',
];

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [relative(out, path).replaceAll('\\', '/')];
  });
}

if (!existsSync(out)) {
  console.error('web-dist is missing: run "npm run build:web" first.');
  process.exit(1);
}

const policy = contentSecurityPolicy(process.env.VITE_API_URL || DEFAULT_API_URL);
const all = files(out);
const pages = all.filter((f) => f.endsWith('.html'));

for (const page of [...LANDING_PAGES, 'admin/index.html']) {
  if (!all.includes(page)) fail(`missing page: ${page}`);
}
if (!all.includes('robots.txt')) fail('missing robots.txt');
else if (!/^Disallow: \/admin$/m.test(read('robots.txt'))) fail('robots.txt must disallow /admin');

for (const page of pages) {
  const html = read(page);
  if (!html.includes(`content="${policy}"`))
    fail(`${page}: Content-Security-Policy missing or different`);
  // Every script is a file of this site; no inline code, nothing from other servers.
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    if (!src) fail(`${page}: inline script ${tag}`);
    else if (!src.startsWith('/')) fail(`${page}: script from another server ${src}`);
  }
}

const admin = all.includes('admin/index.html') ? read('admin/index.html') : '';
if (admin && !admin.includes('<meta name="robots" content="noindex, nofollow"')) {
  fail('admin/index.html: robots noindex meta missing');
}
for (const url of admin.match(/(?:src|href)="([^"]+)"/g) ?? []) {
  const value = url.split('"')[1];
  if (!value.startsWith('/admin/')) fail(`admin/index.html: ${value} is not under /admin/`);
}
for (const file of all.filter((f) => /\.(html|css|js)$/.test(f))) {
  if (/fonts\.(googleapis|gstatic)\.com/.test(read(file))) fail(`${file}: loads Google Fonts`);
}

if (problems.length > 0) {
  console.error(`Website check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Website OK: ${pages.length} pages (6 landing + admin), CSP on every page, admin private.`,
);
