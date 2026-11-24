/**
 * Backs up the configured database to files (TIQ-25), without extra tools:
 *
 *   PowerShell:  $env:MONGODB_DB_NAME = "kobaniq_staging"; npm.cmd run db:backup -w backend
 *
 * Folder: BACKUP_DIR, or <home>/kobaniq-backups/<database>-<time>. Outside the
 * repository on purpose: the files hold every document (emails, password
 * hashes). Keep them private; never commit or upload them.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { backupDatabase, backupFolder } from '../lib/backup.js';
import { connectDB, disconnectDB } from '../lib/db.js';

async function run() {
  await connectDB({ retries: 2 });
  const dir = backupFolder(env.mongoDbName);
  const manifest = await backupDatabase(mongoose.connection.db!, dir);
  const docs = manifest.collections.reduce((sum, c) => sum + c.count, 0);
  console.log(
    `Backup of ${manifest.database}: ${manifest.collections.length} collections, ${docs} documents`,
  );
  console.log(`Saved in ${dir}`);
  console.log('Private data: keep this folder safe, never commit or upload it.');
}

run()
  .catch((err) => {
    console.error('Backup FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
