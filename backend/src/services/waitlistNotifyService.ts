import { env } from '../config/env.js';
import { sendEmail, type EmailMessage } from '../lib/mailer.js';
import { Waitlist } from '../models/Waitlist.js';

/**
 * "Someone joined the waitlist" email to the team (ALERT_EMAIL; empty = off),
 * sent with the server's existing Resend key. Never stops a sign-up: it runs
 * after the person is saved, and a failed email is only logged.
 *
 * - Only for new sign-ups: a repeated email (409) or a bot sends nothing.
 * - At most one email per ALERT_COOLDOWN_MS (15 min); sign-ups in between are
 *   counted and reported in the next email, so a busy hour is one or two emails.
 * - No personal data in the email: the count and total only. Who joined is in
 *   the admin dashboard → Waitlist (admins only).
 */

export type WaitlistNotifyResult = 'sent' | 'off' | 'held' | 'failed';

let lastSentAt = 0;
let held = 0;

/** Tests only. */
export function resetWaitlistNotifyForTests() {
  lastSentAt = 0;
  held = 0;
}

export async function notifyWaitlistSignup(
  deps: { send?: (message: EmailMessage) => Promise<void>; now?: () => number } = {},
): Promise<WaitlistNotifyResult> {
  const to = env.alertEmail;
  if (!to) return 'off';
  const now = (deps.now ?? Date.now)();
  held += 1;
  if (lastSentAt && now - lastSentAt < env.alertCooldownMs) return 'held';
  const joined = held;
  held = 0;
  lastSentAt = now;
  try {
    const total = await Waitlist.countDocuments();
    const who = joined === 1 ? '1 new person' : `${joined} new people`;
    await (deps.send ?? sendEmail)({
      to,
      subject: `[KOBANIQ ${env.nodeEnv}] ${who} joined the waitlist (${total} in total)`,
      text: [
        `${who} joined the KOBANIQ waitlist from the landing page.`,
        `Total on the waitlist: ${total}.`,
        '',
        'See who joined: admin dashboard → Waitlist (admins only).',
        '',
        `At most one email every ${Math.round(env.alertCooldownMs / 60_000)} minutes;`,
        'sign-ups in between are counted in the next email. No personal data is included.',
      ].join('\n'),
    });
    return 'sent';
  } catch (err) {
    held += joined; // Reported with the next sign-up instead.
    console.error(
      '[waitlist] sign-up email could not be sent:',
      err instanceof Error ? err.message : err,
    );
    return 'failed';
  }
}
