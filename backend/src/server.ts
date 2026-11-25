import { createApp } from './app.js';
import { connectDB, disconnectDB } from './lib/db.js';
import { env } from './config/env.js';
import { ensureDefaultRegions, ensureDefaultSources } from './services/jobSourceService.js';
import { migrateNotificationIndexes } from './services/notificationService.js';
import { recoverStuckRuns } from './services/researchService.js';
import { sendAlert } from './services/alertService.js';
import { startScheduler, stopScheduler } from './services/scheduleService.js';

async function main() {
  await connectDB();
  // Somaliland / Somalia / Remote with doc 9's city lists (admin edits are kept).
  await ensureDefaultRegions();
  // The starting job-source catalog (all switched off until an admin enables them).
  await ensureDefaultSources();
  // Job searches cut off by a restart are marked failed (they run in the background).
  const stuck = await recoverStuckRuns(0);
  // Announcements (TIQ-33) need the newer notification indexes.
  await migrateNotificationIndexes();
  if (stuck > 0) console.log(`Marked ${stuck} interrupted job search(es) as failed`);

  const server = createApp().listen(env.port, () => {
    console.log(`KOBANIQ API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Scheduled searches (TIQ-21): checks every minute for searches whose local time has come.
  startScheduler();

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopScheduler();
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  // A crash is emailed to the team (ALERT_EMAIL) before the server stops.
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    void sendAlert({
      kind: 'crash',
      key: err.name,
      title: 'The server crashed (uncaught exception) and is restarting',
      lines: [`Error: ${err.name}: ${err.message}`],
    }).finally(() => process.exit(1));
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
    const name = reason instanceof Error ? reason.name : typeof reason;
    void sendAlert({
      kind: 'crash',
      key: `rejection:${name}`,
      title: 'Unhandled error in the server (promise rejection)',
      lines: [`Error: ${name}: ${reason instanceof Error ? reason.message : String(reason)}`],
    });
  });
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
