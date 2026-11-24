import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';

/**
 * Database backup and restore without extra tools (TIQ-25). The free Atlas plan
 * has no backups of its own, so we copy every collection to files:
 * `<collection>.jsonl` (one document per line, canonical Extended JSON, so
 * ObjectIds, dates and numbers come back exactly) and `manifest.json` (count,
 * SHA-256 fingerprint and indexes per collection).
 *
 * The files hold everything in the database (password hashes, emails): keep
 * them private, outside the repository, and never upload them.
 */

type Db = mongoose.mongo.Db;
const { EJSON } = mongoose.mongo.BSON;

export interface CollectionManifest {
  name: string;
  count: number;
  /** SHA-256 of every document's canonical Extended JSON, in _id order. */
  sha256: string;
  /** Index definitions except the default _id index. */
  indexes: Record<string, unknown>[];
}

export interface BackupManifest {
  format: 'kobaniq-backup-1';
  database: string;
  createdAt: string;
  collections: CollectionManifest[];
}

/**
 * Where a backup goes: BACKUP_DIR, or <home>/kobaniq-backups/<database>-<time>.
 * Outside the repository on purpose (the files hold private data).
 */
export function backupFolder(database: string, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return process.env.BACKUP_DIR || join(homedir(), 'kobaniq-backups', `${database}-${stamp}`);
}

const line = (doc: unknown) => EJSON.stringify(doc, { relaxed: false });

async function userCollections(db: Db) {
  const all = await db.listCollections({}, { nameOnly: false }).toArray();
  return all
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();
}

/** Count and fingerprint of one collection as it is now. */
async function fingerprint(db: Db, name: string) {
  const hash = createHash('sha256');
  let count = 0;
  for await (const doc of db.collection(name).find({}).sort({ _id: 1 })) {
    hash.update(line(doc) + '\n');
    count += 1;
  }
  return { count, sha256: hash.digest('hex') };
}

/** Copies every collection of `db` into `dir` (created). Returns the manifest. */
export async function backupDatabase(db: Db, dir: string): Promise<BackupManifest> {
  mkdirSync(dir, { recursive: true });
  const collections: CollectionManifest[] = [];
  for (const name of await userCollections(db)) {
    const hash = createHash('sha256');
    const lines: string[] = [];
    for await (const doc of db.collection(name).find({}).sort({ _id: 1 })) {
      const text = line(doc);
      hash.update(text + '\n');
      lines.push(text);
    }
    writeFileSync(join(dir, `${name}.jsonl`), lines.length ? lines.join('\n') + '\n' : '');
    const indexes = (await db.collection(name).indexes())
      .filter((ix) => ix.name !== '_id_')
      .map((ix) => {
        // The index version and namespace belong to the old database, not the definition.
        const definition: Record<string, unknown> = { ...ix };
        delete definition.v;
        delete definition.ns;
        return definition;
      });
    collections.push({ name, count: lines.length, sha256: hash.digest('hex'), indexes });
  }
  const manifest: BackupManifest = {
    format: 'kobaniq-backup-1',
    database: db.databaseName,
    createdAt: new Date().toISOString(),
    collections,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function readManifest(dir: string): BackupManifest {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as BackupManifest;
  if (manifest.format !== 'kobaniq-backup-1') throw new Error('Not a KOBANIQ backup folder');
  const files = new Set(readdirSync(dir));
  for (const c of manifest.collections) {
    if (!files.has(`${c.name}.jsonl`)) throw new Error(`Backup is missing ${c.name}.jsonl`);
  }
  return manifest;
}

/**
 * Restores a backup into `db`, which must be empty: a restore never mixes with
 * or overwrites existing data. Indexes are created again. Batches of 500.
 */
export async function restoreDatabase(db: Db, dir: string) {
  const manifest = readManifest(dir);
  for (const name of await userCollections(db)) {
    if ((await db.collection(name).estimatedDocumentCount()) > 0) {
      throw new Error(
        `Restore target "${db.databaseName}" is not empty (${name} has documents). ` +
          'Restore only into an empty database.',
      );
    }
  }
  for (const c of manifest.collections) {
    const collection = db.collection(c.name);
    const text = readFileSync(join(dir, `${c.name}.jsonl`), 'utf8');
    const docs = text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => EJSON.parse(l, { relaxed: false }) as mongoose.mongo.Document);
    if (docs.length === 0) await db.createCollection(c.name).catch(() => undefined);
    for (let i = 0; i < docs.length; i += 500) {
      await collection.insertMany(docs.slice(i, i + 500), { ordered: true });
    }
    if (c.indexes.length > 0) {
      await collection.createIndexes(c.indexes as unknown as mongoose.mongo.IndexDescription[]);
    }
  }
  return manifest;
}

/**
 * Compares `db` with a backup: same collections, same counts, same document
 * fingerprints, same indexes. Returns the problems (empty = identical).
 */
export async function verifyDatabase(db: Db, manifest: BackupManifest) {
  const problems: string[] = [];
  const present = new Set(await userCollections(db));
  for (const c of manifest.collections) {
    if (!present.has(c.name)) {
      problems.push(`${c.name}: missing`);
      continue;
    }
    const now = await fingerprint(db, c.name);
    if (now.count !== c.count)
      problems.push(`${c.name}: ${now.count} documents, backup has ${c.count}`);
    else if (now.sha256 !== c.sha256) problems.push(`${c.name}: documents differ from the backup`);
    const names = new Set((await db.collection(c.name).indexes()).map((ix) => ix.name));
    for (const ix of c.indexes) {
      if (!names.has(String(ix.name))) problems.push(`${c.name}: index ${String(ix.name)} missing`);
    }
  }
  return problems;
}
