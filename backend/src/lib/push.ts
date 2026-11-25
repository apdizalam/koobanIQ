import { env } from '../config/env.js';
import { PushTicket } from '../models/PushTicket.js';
import { notePushError } from '../services/pushReceiptService.js';

/**
 * Push messages through the Expo Push Service (TIQ-22): free, no account key
 * needed by default (https://exp.host/--/api/v2/push/send). Only Expo push
 * tokens are sent to; the message carries the job id so tapping it opens the job.
 */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

/** Messages "sent" in tests (nothing leaves the machine). */
export const pushOutbox: PushMessage[] = [];

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo push tokens look like ExponentPushToken[xxx] (older: ExpoPushToken[xxx]). */
export const isExpoPushToken = (token: unknown): token is string =>
  typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]{10,200}\]$/.test(token);

/** Most messages per request to the Expo Push Service. */
export const PUSH_BATCH = 100;

export const pushSettings = {
  /** Tests may replace the sender; by default: outbox in tests, Expo otherwise. */
  send: null as null | ((messages: PushMessage[]) => Promise<{ invalidTokens: string[] }>),
};

/**
 * Sends the messages; returns tokens Expo says are no longer valid (the app
 * was removed, or notifications turned off on the phone) so they are forgotten.
 */
export async function sendPush(messages: PushMessage[]): Promise<{ invalidTokens: string[] }> {
  if (messages.length === 0) return { invalidTokens: [] };
  if (pushSettings.send) return pushSettings.send(messages);
  if (env.nodeEnv === 'test') {
    pushOutbox.push(...messages);
    return { invalidTokens: [] };
  }
  return sendToExpo(messages);
}

/** An Expo push ticket (the answer to one message). */
interface PushTicketAnswer {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * The real sending, also used by tests with a fake `fetch`. Accepted messages
 * get a ticket whose receipt is checked about 15 minutes later
 * (pushReceiptService): some problems, such as wrong Firebase credentials,
 * only show up there.
 */
export async function sendToExpo(
  messages: PushMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  const accepted: { ticketId: string; token: string }[] = [];
  // The Expo Push Service takes at most 100 messages per request.
  for (let i = 0; i < messages.length; i += PUSH_BATCH) {
    const batch = messages.slice(i, i + PUSH_BATCH);
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
    });
    if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
    const json = (await res.json()) as { data?: PushTicketAnswer[] };
    (json.data ?? []).forEach((ticket, n) => {
      const token = batch[n].to;
      if (ticket.status === 'ok' && ticket.id) accepted.push({ ticketId: ticket.id, token });
      else if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(token);
      else if (ticket.status === 'error') void notePushError(ticket.details?.error ?? 'unknown');
    });
  }
  if (accepted.length > 0) {
    await PushTicket.insertMany(accepted, { ordered: false }).catch((err: unknown) =>
      console.warn('[push] tickets not saved:', err instanceof Error ? err.message : err),
    );
  }
  return { invalidTokens };
}
