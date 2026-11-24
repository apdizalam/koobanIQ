#!/usr/bin/env node
/**
 * Serves web-dist/ on this computer the way Vercel will (TIQ-25): the same
 * files, the rewrites and the headers from vercel.json. For checking the one
 * website before it is deployed:
 *
 *   npm run build:web && npm run serve:web      → http://localhost:4173
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web-dist');
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

/** vercel.json "source" patterns used here: literal paths with (regex) groups. */
const matches = (source, path) => new RegExp(`^${source}$`).test(path);

/** A file for this path: the file itself, or folder/index.html (like Vercel). */
function fileFor(path) {
  const target = normalize(join(out, decodeURIComponent(path)));
  if (!target.startsWith(out + sep) && target !== out) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, 'index.html');
  return existsSync(index) ? index : null;
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  let file = fileFor(path);
  if (!file) {
    const rule = config.rewrites.find((r) => matches(r.source, path));
    if (rule) file = fileFor(rule.destination);
  }
  for (const rule of config.headers) {
    if (matches(rule.source, path)) for (const h of rule.headers) res.setHeader(h.key, h.value);
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404: not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`KOBANIQ website (web-dist) on http://localhost:${port}`));
