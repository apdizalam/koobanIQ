import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB, redactUri } from '../src/lib/db.js';

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await disconnectDB();
});

test('redactUri hides credentials', () => {
  assert.equal(
    redactUri('mongodb+srv://user:secret@cluster0.example.net/db'),
    'mongodb+srv://***:***@cluster0.example.net/db',
  );
});

test('health reports 503 while the database is not connected', async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.data.db.ok, false);
  assert.equal(body.error.code, 'DB_UNAVAILABLE');
});

test('unknown routes return the standard 404 envelope', async () => {
  const res = await fetch(`${baseUrl}/api/v1/nope`);
  const body = await res.json();
  assert.equal(res.status, 404);
  assert.deepEqual(body.error, { code: 'NOT_FOUND', message: 'Route not found' });
});

test('connects to Atlas, health reports DB OK, and a document round-trips', async () => {
  await connectDB({ dbName: 'kobaniq_test', retries: 2 });

  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.db.ok, true);
  assert.equal(body.data.db.name, 'kobaniq_test');

  const collection = mongoose.connection.db!.collection('connectionChecks');
  const { insertedId } = await collection.insertOne({ note: 'health-test' });
  const found = await collection.findOne({ _id: insertedId });
  await collection.deleteOne({ _id: insertedId });
  assert.equal(found?.note, 'health-test');
});
