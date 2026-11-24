/**
 * Restores a backup folder (from npm run db:backup) into an EMPTY database and
 * checks it against the backup (TIQ-25). It never overwrites data: a target
 * with documents is refused. The target is always named explicitly:
 *
 *   PowerShell:
 *     $env:RESTORE_TARGET_DB = "kobaniq_prod"      # must be empty
 *     npm.cmd run db:restore -w backend -- "C:\Users\...\kobaniq-backups\kobaniq_prod-2026-..."
 */
import mongoose from 'mongoose';
import { restoreDatabase, verifyDatabase } from '../lib/backup.js';
import { connectDB, disconnectDB } from '../lib/db.js';

async function run() {
  const dir = process.argv[2];
  const target = (process.env.RESTORE_TARGET_DB ?? '').trim();
  if (!dir || !target) {
    throw new Error(
      'Usage: set RESTORE_TARGET_DB (an empty database), then npm run db:restore -w backend -- <backup folder>',
    );
  }
  await connectDB({ dbName: target, retries: 2 });
  const db = mongoose.connection.db!;
  const manifest = await restoreDatabase(db, dir);
  const problems = await verifyDatabase(db, manifest);
  const docs = manifest.collections.reduce((sum, c) => sum + c.count, 0);
  if (problems.length > 0) {
    throw new Error(`restored, but it differs from the backup:\n- ${problems.join('\n- ')}`);
  }
  console.log(
    `Restored ${manifest.database} (backup ${manifest.createdAt}) into ${target}: ` +
      `${manifest.collections.length} collections, ${docs} documents, identical to the backup.`,
  );
}

run()
  .catch((err) => {
    console.error('Restore FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
