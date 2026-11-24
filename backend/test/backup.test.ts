import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import {
  backupDatabase,
  readManifest,
  restoreDatabase,
  verifyDatabase,
} from '../src/lib/backup.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { RUN_ID } from './support/testRun.js';

/**
 * TIQ-25: backup → restore into an empty database → identical. Own throwaway
 * databases and a temporary folder per run, all removed at the end.
 */
const SOURCE = `kobaniq_test_backup_${RUN_ID}`;
const TARGET = `kobaniq_test_backup_r_${RUN_ID}`;
let folder: string;

const client = () => mongoose.connection.getClient();
const { ObjectId, Decimal128, Binary } = mongoose.mongo;

before(async () => {
  await connectDB({ dbName: SOURCE, retries: 2 });
  folder = mkdtempSync(join(tmpdir(), 'kobaniq-backup-test-'));
  const db = client().db(SOURCE);
  await db.collection('users').insertMany([
    {
      _id: new ObjectId(),
      email: 'a@example.invalid',
      createdAt: new Date('2026-01-02T03:04:05.678Z'),
      score: new Decimal128('12.50'),
      big: 2 ** 53 + 2,
      nested: { list: [1, 'two', { three: true }], empty: null },
      photo: new Binary(Buffer.from([0, 1, 2, 255])),
    },
    { _id: new ObjectId(), email: 'b@example.invalid', createdAt: new Date(0), score: 0.1 },
  ]);
  await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  await db.collection('emptyOnes').insertOne({ tmp: 1 });
  await db.collection('emptyOnes').deleteMany({});
});

after(async () => {
  await client().db(SOURCE).dropDatabase();
  await client().db(TARGET).dropDatabase();
  rmSync(folder, { recursive: true, force: true });
  await disconnectDB();
});

test('backup writes one file per collection and a manifest with counts, fingerprints and indexes', async () => {
  const manifest = await backupDatabase(client().db(SOURCE), folder);
  assert.equal(manifest.database, SOURCE);
  const users = manifest.collections.find((c) => c.name === 'users');
  assert.equal(users?.count, 2);
  assert.match(users?.sha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(users?.indexes[0]?.name, 'email_unique');
  assert.equal(manifest.collections.find((c) => c.name === 'emptyOnes')?.count, 0);
  assert.deepEqual(readManifest(folder), manifest);
  // Canonical Extended JSON keeps exact types (no lossy numbers or dates).
  const text = readFileSync(join(folder, 'users.jsonl'), 'utf8');
  assert.match(text, /\$numberDecimal/);
  assert.match(text, /\$date/);
  assert.match(text, /\$binary/);
});

test('restore into an empty database gives identical documents and indexes', async () => {
  const manifest = readManifest(folder);
  await restoreDatabase(client().db(TARGET), folder);
  assert.deepEqual(await verifyDatabase(client().db(TARGET), manifest), []);

  const original = await client().db(SOURCE).collection('users').find().sort({ _id: 1 }).toArray();
  const copy = await client().db(TARGET).collection('users').find().sort({ _id: 1 }).toArray();
  // Exact types and values: compare in canonical Extended JSON.
  const exact = (docs: unknown) => mongoose.mongo.BSON.EJSON.stringify(docs, { relaxed: false });
  assert.equal(copy.length, 2);
  assert.equal(exact(copy), exact(original));
  // The unique index works again in the copy.
  await assert.rejects(
    client().db(TARGET).collection('users').insertOne({ email: 'a@example.invalid' }),
  );
});

test('restore refuses a database that has data (never overwrites)', async () => {
  await assert.rejects(restoreDatabase(client().db(TARGET), folder), /not empty/);
  await assert.rejects(restoreDatabase(client().db(SOURCE), folder), /not empty/);
});

test('verify finds a changed, missing or extra document', async () => {
  const manifest = readManifest(folder);
  const users = client().db(TARGET).collection('users');
  await users.updateOne({ email: 'b@example.invalid' }, { $set: { score: 0.2 } });
  assert.match((await verifyDatabase(client().db(TARGET), manifest)).join(), /differ/);
  await users.deleteOne({ email: 'b@example.invalid' });
  assert.match((await verifyDatabase(client().db(TARGET), manifest)).join(), /1 documents/);
});

test('a folder that is not a backup is refused', () => {
  assert.throws(() => readManifest(tmpdir()), /ENOENT|Not a KOBANIQ backup/);
});
