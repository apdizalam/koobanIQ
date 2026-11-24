/**
 * Restore drill (TIQ-25 End Test "database backup restored successfully once"):
 * backs up the configured database, restores the backup into a NEW temporary
 * database, checks every collection (counts, document fingerprints, indexes)
 * and deletes only that temporary database. The source database is only read.
 *
 *   PowerShell:  $env:MONGODB_DB_NAME = "kobaniq_staging"; npm.cmd run db:restore-drill -w backend
 *
 * The backup folder is kept (BACKUP_DIR or <home>/kobaniq-backups/...); it holds
 * private data.
 */
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { backupDatabase, backupFolder, restoreDatabase, verifyDatabase } from '../lib/backup.js';
import { connectDB, disconnectDB } from '../lib/db.js';

async function run() {
  await connectDB({ retries: 2 });
  const source = mongoose.connection.db!;
  const started = Date.now();
  const dir = backupFolder(env.mongoDbName);
  const manifest = await backupDatabase(source, dir);
  const docs = manifest.collections.reduce((sum, c) => sum + c.count, 0);
  console.log(
    `1. Backup of ${manifest.database}: ${manifest.collections.length} collections, ${docs} documents → ${dir}`,
  );

  const scratchName = `kobaniq_restore_drill_${randomBytes(3).toString('hex')}`;
  const scratch = mongoose.connection.getClient().db(scratchName);
  try {
    await restoreDatabase(scratch, dir);
    console.log(`2. Restored into the new database ${scratchName}`);
    const problems = await verifyDatabase(scratch, manifest);
    if (problems.length > 0) {
      throw new Error(`3. Restored copy differs:\n- ${problems.join('\n- ')}`);
    }
    console.log('3. Check: every collection has the same documents and indexes as the backup');
  } finally {
    // Only the database this drill made is deleted.
    if (scratch.databaseName.startsWith('kobaniq_restore_drill_')) await scratch.dropDatabase();
    console.log(`4. Temporary database ${scratchName} deleted`);
  }
  console.log(`Restore drill passed in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

run()
  .catch((err) => {
    console.error('Restore drill FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
