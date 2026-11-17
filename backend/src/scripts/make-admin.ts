/**
 * Gives an existing account the admin role in the configured database.
 * Register the account first, then run:
 *   npm run admin:promote -w backend -- someone@example.com
 */
import { connectDB, disconnectDB } from '../lib/db.js';
import { promoteToAdmin } from '../services/userService.js';

async function run() {
  const email = process.argv[2];
  if (!email) {
    throw new Error('Usage: npm run admin:promote -w backend -- someone@example.com');
  }
  await connectDB({ retries: 2 });
  const user = await promoteToAdmin(email);
  console.log(`${user.email} is now an admin.`);
}

run()
  .catch((err) => {
    console.error('Promote FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
