import { PushToken } from '../models/Notification.js';
import { PushTicket } from '../models/PushTicket.js';
import { sendAlert, type AlertResult } from './alertService.js';

/**
 * Push receipts (Firebase / FCM setup): Expo accepts a push at once (a ticket)
 * but only knows later whether Apple or Google took it. Some problems appear
 * only in that receipt: wrong or missing Firebase credentials, a phone that no
 * longer has the app, a message that is too big. Expo advises checking about
 * 15 minutes after sending; receipts are kept for 24 hours.
 *
 * - DeviceNotRegistered → the token is forgotten (no more sends to it).
 * - InvalidCredentials / MismatchSenderId → one alert email to the team (the
 *   Firebase key at Expo or google-services.json is wrong).
 * - Other errors → logged (no message content is ever kept).
 */

const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Check receipts of tickets at least this old. */
export const RECEIPT_DELAY_MS = 15 * 60_000;
/** Expo takes at most 1000 ids per receipts request. */
const RECEIPTS_BATCH = 1000;
const CHECK_EVERY_MS = 5 * 60_000;

/** Errors that mean our Firebase (FCM) or Apple setup is wrong, not the phone. */
const SETUP_ERRORS = new Set(['InvalidCredentials', 'MismatchSenderId']);

interface Receipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** A push error that is not about one phone: an alert when it is a setup problem. */
export function notePushError(error: string): Promise<AlertResult | 'logged'> {
  if (!SETUP_ERRORS.has(error)) {
    console.warn(`[push] Expo reported ${error}`);
    return Promise.resolve('logged');
  }
  return sendAlert({
    kind: 'push',
    key: error,
    title: `Push notifications are failing: ${error}`,
    lines: [
      error === 'InvalidCredentials'
        ? 'Expo could not deliver to Android/iPhone with the stored credentials.'
        : 'The Firebase sender in google-services.json does not match the FCM key at Expo.',
      'Check the FCM V1 service account key at expo.dev → Credentials → Android,',
      'and that google-services.json belongs to the same Firebase project.',
    ],
  });
}

export interface ReceiptCheckResult {
  checked: number;
  forgottenTokens: number;
  setupErrors: number;
}

/** Checks the receipts of tickets that are old enough; removes every checked ticket. */
export async function checkPushReceipts(
  deps: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<ReceiptCheckResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const before = new Date((deps.now ?? Date.now)() - RECEIPT_DELAY_MS);
  const due = await PushTicket.find({ createdAt: { $lte: before } })
    .sort({ createdAt: 1 })
    .limit(RECEIPTS_BATCH)
    .lean();
  const result: ReceiptCheckResult = { checked: 0, forgottenTokens: 0, setupErrors: 0 };
  if (due.length === 0) return result;

  const res = await fetchImpl(RECEIPTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids: due.map((t) => t.ticketId) }),
  });
  if (!res.ok) throw new Error(`Expo receipts answered ${res.status}`);
  const receipts = ((await res.json()) as { data?: Record<string, Receipt> }).data ?? {};

  const deadTokens: string[] = [];
  for (const ticket of due) {
    const receipt = receipts[ticket.ticketId];
    if (!receipt) continue; // Not ready yet at Expo: checked next time (or expires after 24 h).
    result.checked += 1;
    if (receipt.status !== 'error') continue;
    const error = receipt.details?.error ?? 'unknown';
    if (error === 'DeviceNotRegistered') deadTokens.push(ticket.token);
    else {
      if (SETUP_ERRORS.has(error)) result.setupErrors += 1;
      await notePushError(error);
    }
  }
  if (deadTokens.length > 0) {
    result.forgottenTokens = (
      await PushToken.deleteMany({ token: { $in: deadTokens } })
    ).deletedCount;
  }
  const checkedIds = due.filter((t) => receipts[t.ticketId]).map((t) => t.ticketId);
  if (checkedIds.length > 0) await PushTicket.deleteMany({ ticketId: { $in: checkedIds } });
  return result;
}

let timer: NodeJS.Timeout | null = null;

/** Every 5 minutes while the server runs (started in server.ts). */
export function startPushReceiptChecks() {
  if (timer) return;
  timer = setInterval(() => {
    void checkPushReceipts().catch((err: unknown) =>
      console.warn('[push] receipt check failed:', err instanceof Error ? err.message : err),
    );
  }, CHECK_EVERY_MS);
  timer.unref();
}

export function stopPushReceiptChecks() {
  if (timer) clearInterval(timer);
  timer = null;
}
