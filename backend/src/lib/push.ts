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
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages.map((m) => ({ ...m, sound: 'default' }))),
  });
  if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
  const json = (await res.json()) as {
    data?: { status: string; details?: { error?: string } }[];
  };
  const invalidTokens = (json.data ?? [])
    .map((ticket, i) =>
      ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
        ? messages[i].to
        : null,
    )
    .filter((t): t is string => t !== null);
  return { invalidTokens };
}
