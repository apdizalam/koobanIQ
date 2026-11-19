/**
 * Gives an existing ADMIN account super admin rights (AI privacy setting,
 * test accounts) in the configured database. Only possible from the server
 * with database access; there is no API for it.
 *   npm run admin:super -w backend -- someone@example.com
 */
import { connectDB, disconnectDB } from '../lib/db.js';
import { promoteToSuperAdmin } from '../services/userService.js';

async function run() {
  const email = process.argv[2];
  if (!email) {
    throw new Error('Usage: npm run admin:super -w backend -- someone@example.com');
  }
  await connectDB({ retries: 2 });
  const user = await promoteToSuperAdmin(email);
  console.log(`${user.email} is now a super admin.`);
}

run()
  .catch((err) => {
    console.error('Super admin FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
