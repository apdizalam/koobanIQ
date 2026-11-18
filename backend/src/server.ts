import { createApp } from './app.js';
import { connectDB, disconnectDB } from './lib/db.js';
import { env } from './config/env.js';
import { ensureDefaultRegions } from './services/jobSourceService.js';

async function main() {
  await connectDB();
  // Somaliland / Somalia / Remote with doc 9's city lists (admin edits are kept).
  await ensureDefaultRegions();

  const server = createApp().listen(env.port, () => {
    console.log(`KOBANIQ API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
