import type { Lang } from './routes';

/** The KOBANIQ API (VITE_API_URL in landing/.env; local backend by default). */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WaitlistForm {
  email: string;
  name: string;
  consent: boolean;
  /** Hidden field people never see; bots fill it (the server then saves nothing). */
  website: string;
}

/** What is wrong with the form before sending (same rules as the server), or null. */
export function formProblem(form: WaitlistForm): 'emailInvalid' | 'consentMissing' | null {
  if (!EMAIL_RE.test(form.email.trim())) return 'emailInvalid';
  if (!form.consent) return 'consentMissing';
  return null;
}

export type JoinResult =
  | { ok: true }
  /** The server's own message (already in the page language), e.g. "already on the waitlist". */
  | { ok: false; message: string | null };

/** POST /waitlist. Never throws: a network problem is { ok: false, message: null }. */
export async function joinWaitlist(
  form: WaitlistForm,
  lang: Lang,
  fetcher: typeof fetch = fetch,
): Promise<JoinResult> {
  try {
    const res = await fetcher(`${API_URL}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': lang },
      body: JSON.stringify({
        email: form.email.trim(),
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        language: lang,
        consent: form.consent,
        website: form.website,
      }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return { ok: false, message: body?.error?.message ?? null };
  } catch {
    return { ok: false, message: null };
  }
}
