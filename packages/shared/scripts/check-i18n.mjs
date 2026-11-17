#!/usr/bin/env node
/**
 * Checks the shared translation files (architecture doc §3 "Quality").
 *
 *   node scripts/check-i18n.mjs            fail if en/so keys or {{placeholders}} differ,
 *                                          or so.review.json is out of date
 *   node scripts/check-i18n.mjs --sync     update so.review.json: new keys -> pending,
 *                                          keys whose English changed -> pending again
 *   node scripts/check-i18n.mjs --release  also fail while any Somali key is pending
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n');
const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

/** { a: { b: 'x' } } -> { 'a.b': 'x' } */
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

const placeholders = (text) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const en = flatten(read('en.json'));
const so = flatten(read('so.json'));
const reviewFile = 'so.review.json';
let review = {};
try {
  review = read(reviewFile);
} catch {
  review = {};
}

const mode = process.argv[2];
const problems = [];

for (const key of Object.keys(en)) {
  if (!(key in so)) problems.push(`missing in so.json: ${key}`);
  else if (placeholders(en[key]).join() !== placeholders(so[key]).join()) {
    problems.push(`placeholders differ for ${key}: en ${en[key]} | so ${so[key]}`);
  }
}
for (const key of Object.keys(so)) {
  if (!(key in en)) problems.push(`in so.json but not en.json: ${key}`);
}

// Review state per key; `en` remembers the English text the Somali was checked against.
const nextReview = {};
for (const key of Object.keys(en).sort()) {
  const old = review[key];
  const unchanged = old && old.en === en[key];
  nextReview[key] = { state: unchanged ? old.state : 'pending', en: en[key] };
}
const outOfDate = JSON.stringify(nextReview) !== JSON.stringify(review);

if (mode === '--sync') {
  writeFileSync(join(dir, reviewFile), `${JSON.stringify(nextReview, null, 2)}\n`);
  console.log(`${reviewFile} updated.`);
} else if (outOfDate) {
  problems.push(`${reviewFile} is out of date: run "npm run i18n:sync -w @kobaniq/shared"`);
}

const pending = Object.values(nextReview).filter((r) => r.state !== 'approved').length;
if (mode === '--release' && pending > 0) {
  problems.push(`${pending} Somali strings still pending review (product owner sign-off)`);
}

if (problems.length > 0) {
  console.error(`i18n check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `i18n OK: ${Object.keys(en).length} keys in en and so; ${pending} Somali strings pending review.`,
);
