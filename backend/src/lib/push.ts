import { env } from '../config/env.js';

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
  const invalidTokens: string[] = [];
  // The Expo Push Service takes at most 100 messages per request.
  for (let i = 0; i < messages.length; i += PUSH_BATCH) {
    const batch = messages.slice(i, i + PUSH_BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
    });
    if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
    const json = (await res.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    (json.data ?? []).forEach((ticket, n) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(batch[n].to);
      }
    });
  }
  return { invalidTokens };
}
