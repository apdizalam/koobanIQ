/**
 * Sends one test alert email to ALERT_EMAIL (TIQ-25 End Test "error alert
 * reaches the team channel"), the same way the server sends real alerts:
 *
 *   PowerShell:  npm.cmd run alert:test -w backend
 *
 * Needs RESEND_API_KEY and ALERT_EMAIL (backend/.env or the terminal). With
 * Resend's test sender, ALERT_EMAIL must be the Resend account's own email.
 */
import { env } from '../config/env.js';
import { sendAlert } from '../services/alertService.js';

async function run() {
  if (!env.alertEmail) {
    throw new Error('ALERT_EMAIL is not set (backend/.env or the terminal).');
  }
  const result = await sendAlert({
    kind: 'test',
    title: 'Test alert: alerts reach you',
    lines: [
      'This is a test. Real alerts look like this and arrive when the server has an error (500),',
      'crashes, or when many AI requests fail in a short time.',
    ],
  });
  if (result !== 'sent') throw new Error(`the alert was not sent (${result})`);
  console.log(
    `Test alert sent (environment: ${env.nodeEnv}). Check the ALERT_EMAIL inbox and spam folder.`,
  );
}

run().catch((err) => {
  console.error('Alert test FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
