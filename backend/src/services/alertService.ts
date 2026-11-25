import { hostname } from 'node:os';
import { env } from '../config/env.js';
import { sendEmail, type EmailMessage } from '../lib/mailer.js';

/**
 * Error alerts by email (TIQ-25): the team hears about problems without
 * watching logs. Sent with the Resend key the server already has, to
 * ALERT_EMAIL (empty = alerts off). Resend's test sender only delivers to the
 * Resend account's own address, which is what ALERT_EMAIL is today.
 *
 * - Throttled: one email per kind of problem per ALERT_COOLDOWN_MS (15 min);
 *   the next email says how many more happened meanwhile.
 * - No personal data: email addresses and long numbers are blanked out, texts
 *   are cut short, and no request body, token or user content is ever included.
 * - Never breaks the request or the server: a failed alert is only logged.
 */

export type AlertKind = 'server_error' | 'crash' | 'ai_outage' | 'test';
export type AlertResult = 'sent' | 'off' | 'throttled' | 'failed';

interface Throttle {
  lastSentAt: number;
  suppressed: number;
}
const throttles = new Map<string, Throttle>();

/** Tests only: forget every throttle and AI failure. */
export function resetAlertsForTests() {
  throttles.clear();
  aiFailures.length = 0;
}

/** Removes things that could identify a person or unlock something. */
export function scrub(text: string, max = 300): string {
  return text
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, '[email]')
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [token]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[long value]')
    .replace(/\d{6,}/g, '[number]')
    .slice(0, max);
}

export async function sendAlert(
  input: {
    kind: AlertKind;
    /** Problems with the same key share one throttle (e.g. the error's name). */
    key?: string;
    title: string;
    lines?: string[];
  },
  deps: { send?: (message: EmailMessage) => Promise<void>; now?: () => number } = {},
): Promise<AlertResult> {
  const to = env.alertEmail;
  if (!to) return 'off';
  const now = (deps.now ?? Date.now)();
  const throttleKey = `${input.kind}:${input.key ?? ''}`;
  const throttle = throttles.get(throttleKey);
  if (throttle && now - throttle.lastSentAt < env.alertCooldownMs) {
    throttle.suppressed += 1;
    return 'throttled';
  }
  const suppressed = throttle?.suppressed ?? 0;
  throttles.set(throttleKey, { lastSentAt: now, suppressed: 0 });

  const text = [
    `KOBANIQ ${env.nodeEnv}: ${scrub(input.title, 160)}`,
    '',
    ...(input.lines ?? []).map((l) => scrub(l)),
    '',
    `Time: ${new Date(now).toISOString()}`,
    `Server: ${scrub(hostname(), 60)} (database ${env.mongoDbName})`,
    ...(suppressed > 0
      ? [`The same problem happened ${suppressed} more time(s) since the last email.`]
      : []),
    '',
    'At most one email per kind of problem every ' +
      `${Math.round(env.alertCooldownMs / 60_000)} minutes. No personal data is included.`,
  ].join('\n');
  try {
    await (deps.send ?? sendEmail)({
      to,
      subject: `[KOBANIQ ${env.nodeEnv}] ${scrub(input.title, 120)}`,
      text,
    });
    return 'sent';
  } catch (err) {
    console.error('[alert] could not be sent:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}

// ---------------------------------------------------------------- AI outage

/** This many AI failures inside the window = an outage worth an email. */
export const AI_OUTAGE_FAILURES = 5;
const AI_OUTAGE_WINDOW_MS = 15 * 60_000;
const aiFailures: { at: number; feature: string; code: string }[] = [];

/**
 * Called for every AI request that failed at the provider (unavailable,
 * timeout, quota). One failure is normal; several in a short time is an outage.
 */
export function noteAiFailure(
  feature: string,
  code: string,
  deps: Parameters<typeof sendAlert>[1] = {},
) {
  const now = (deps.now ?? Date.now)();
  aiFailures.push({ at: now, feature, code });
  while (aiFailures.length > 0 && now - aiFailures[0].at > AI_OUTAGE_WINDOW_MS) aiFailures.shift();
  if (aiFailures.length < AI_OUTAGE_FAILURES) return Promise.resolve<AlertResult>('off');
  const byCode = new Map<string, number>();
  for (const f of aiFailures) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
  return sendAlert(
    {
      kind: 'ai_outage',
      title: `AI outage: ${aiFailures.length} AI requests failed in 15 minutes`,
      lines: [
        `Errors: ${[...byCode].map(([c, n]) => `${c} × ${n}`).join(', ')}`,
        `Features: ${[...new Set(aiFailures.map((f) => f.feature))].join(', ')}`,
        `Models: main ${env.geminiModel}, second ${env.geminiFallbackModel || '(none)'}`,
        'Usual cause: Google overload (503). Check npm run health and the Usage page.',
      ],
    },
    deps,
  );
}
