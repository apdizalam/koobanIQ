import { env, type NodeEnv } from '../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailerConfig {
  nodeEnv: NodeEnv;
  resendApiKey: string;
  from: string;
  /** Injected in tests; the real global fetch otherwise. */
  fetchImpl?: typeof fetch;
}

/** Emails "sent" in tests. Tests read codes from here; nothing is ever delivered. */
export const outbox: EmailMessage[] = [];

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Sends transactional email (verification and reset codes).
 * - test: never sends; keeps the message in `outbox`.
 * - development without RESEND_API_KEY: prints the email (and its code) in the terminal.
 * - otherwise: Resend. Staging/production without a key is an error, never a silent skip.
 */
export function createMailer(config: MailerConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;

  return async function sendEmail(message: EmailMessage): Promise<void> {
    if (config.nodeEnv === 'test') {
      outbox.push(message);
      return;
    }
    if (!config.resendApiKey) {
      if (config.nodeEnv === 'development') {
        console.log(
          `\n[email · development, not sent] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
        );
        return;
      }
      throw new Error('RESEND_API_KEY is not set: cannot send email (see backend/.env.example).');
    }

    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend rejected the email (${res.status}): ${detail.slice(0, 200)}`);
    }
  };
}

export const sendEmail = createMailer({
  nodeEnv: env.nodeEnv,
  resendApiKey: env.resendApiKey,
  from: env.emailFrom,
});
