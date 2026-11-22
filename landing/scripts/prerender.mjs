/**
 * After `vite build` (client) and `vite build --ssr` (server bundle): writes the
 * rendered HTML of every page into its dist/…/index.html, so the text shows at
 * once without waiting for the script (TIQ-34, Lighthouse performance), and
 * preloads the two fonts used above the fold.
 */
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');
const { render } = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href);

const PAGES = [
  ['/', 'index.html'],
  ['/privacy', 'privacy/index.html'],
  ['/terms', 'terms/index.html'],
  ['/so/', 'so/index.html'],
  ['/so/privacy', 'so/privacy/index.html'],
  ['/so/terms', 'so/terms/index.html'],
];

// The heading font (Manrope 800) and the text font (Inter 400) are needed first.
const assets = readdirSync(join(dist, 'assets'));
const preload = assets
  .filter((f) => /^(manrope-latin-800|inter-latin-400)-normal-.*\.woff2$/.test(f))
  .map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`)
  .join('\n    ');

for (const [path, file] of PAGES) {
  const target = join(dist, file);
  const html = readFileSync(target, 'utf8');
  if (!html.includes('<div id="root"></div>')) throw new Error(`no empty root in ${file}`);
  const out = html
    .replace('<div id="root"></div>', `<div id="root">${render(path)}</div>`)
    .replace('</title>', `</title>\n    ${preload}`);
  writeFileSync(target, out);
}
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerendered ${PAGES.length} pages`);
