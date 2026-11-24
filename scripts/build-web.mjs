#!/usr/bin/env node
/**
 * Builds the one KOBANIQ website (TIQ-25): the landing page at / and the admin
 * dashboard under /admin, into web-dist/ (what Vercel serves).
 *
 *   npm run build:web      (VITE_API_URL and VITE_SITE_URL from the environment)
 *
 * Both apps keep their own code; this script builds each, copies them into one
 * folder and puts the Content-Security-Policy into every page. The policy allows
 * scripts only from this site and connections only to this site and the API
 * (VITE_API_URL), so no outside script can run next to the admin's session.
 */
import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web-dist');

/** Same default as both apps (src/constants/api.ts, src/waitlistApi.ts). */
export const DEFAULT_API_URL = 'http://localhost:5000/api/v1';

export function contentSecurityPolicy(apiUrl) {
  const api = new URL(apiUrl).origin;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Inline style attributes exist in the pre-rendered landing pages.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Puts the policy first in <head>, before any script or style is read. */
export function withPolicy(html, policy) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
  if (html.includes('http-equiv="Content-Security-Policy"')) return html;
  const charset = html.match(/<meta charset="[^"]*"\s*\/?>/i);
  if (charset) return html.replace(charset[0], `${charset[0]}\n    ${tag}`);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd: root, stdio: 'inherit', env: process.env });
}

function main() {
  const apiUrl = process.env.VITE_API_URL || DEFAULT_API_URL;
  run('npm run build --workspace landing');
  run('npm run build --workspace admin-dashboard');

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  cpSync(join(root, 'landing', 'dist'), out, { recursive: true });
  if (existsSync(join(out, 'admin')))
    throw new Error('The landing page must not have an "admin" folder');
  cpSync(join(root, 'Admin-dashboard', 'dist'), join(out, 'admin'), { recursive: true });

  const policy = contentSecurityPolicy(apiUrl);
  const pages = htmlFiles(out);
  for (const file of pages) writeFileSync(file, withPolicy(readFileSync(file, 'utf8'), policy));
  console.log(`\nweb-dist ready: ${pages.length} pages; API ${new URL(apiUrl).origin}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
