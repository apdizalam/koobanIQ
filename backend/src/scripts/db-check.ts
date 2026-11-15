/**
 * Inserts a test document into the configured Atlas database, reads it back,
 * then deletes it. Usage: npm run db:check
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../lib/db.js';

const ConnectionCheck = mongoose.model(
  'ConnectionCheck',
  new mongoose.Schema({ note: String, createdAt: { type: Date, default: Date.now } }),
  'connectionChecks',
);

async function run() {
  await connectDB({ retries: 2 });
  const note = `kobaniq-db-check-${Date.now()}`;
  const created = await ConnectionCheck.create({ note });
  const found = await ConnectionCheck.findById(created._id).lean();
  await ConnectionCheck.deleteOne({ _id: created._id });

  if (found?.note !== note) {
    throw new Error('Read-back mismatch: inserted document was not returned');
  }
  console.log(`DB check OK: inserted and read back a document in ${mongoose.connection.db?.databaseName}`);
}

run()
  .catch((err) => {
    console.error('DB check FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
