/**
 * Creates the first admin account in a database that has none yet, e.g. the
 * new staging database (TIQ-25). Run it yourself; the password never goes in
 * the command line or the code:
 *
 *   PowerShell, one terminal session (nothing is saved to a file):
 *     $env:MONGODB_DB_NAME = "kobaniq_staging"
 *     $env:ADMIN_EMAIL = "you@example.com"
 *     $env:ADMIN_PASSWORD = "<12+ characters>"
 *     npm run admin:create -w backend
 *
 * The account gets the admin role, a confirmed email and the password given.
 * If the email already has an account it becomes an admin and keeps its
 * password (set ADMIN_RESET_PASSWORD=true to replace it). The password is
 * never printed. Database: MONGODB_URI + MONGODB_DB_NAME (backend/.env or the
 * terminal); the name is printed first so you can see where it went.
 */
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../lib/db.js';
import { ensureAdminAccount } from '../services/userService.js';

async function run() {
  const email = process.env.ADMIN_EMAIL ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD first (see the top of create-admin.ts).');
  }
  console.log(`Database: ${env.mongoDbName}`);
  await connectDB({ retries: 2 });
  const result = await ensureAdminAccount({
    email,
    password,
    resetPassword: (process.env.ADMIN_RESET_PASSWORD ?? '').toLowerCase() === 'true',
  });
  console.log(`${result.user.email}: ${result.action} (admin).`);
}

run()
  .catch((err) => {
    console.error('Create admin FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
