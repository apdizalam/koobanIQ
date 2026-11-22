import { useState, type FormEvent } from 'react';
import { pathOf, type Lang } from '../routes';
import type { Texts } from '../texts';
import { formProblem, joinWaitlist, type WaitlistForm } from '../waitlistApi';

type Status =
  { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; text: string };

/** The waitlist form (TIQ-34): email, optional name, agreement to the privacy policy. */
export function Waitlist({ t, lang }: { t: Texts; lang: Lang }) {
  const [form, setForm] = useState<WaitlistForm>({
    email: '',
    name: '',
    consent: false,
    website: '',
  });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = formProblem(form);
    if (problem) {
      setStatus({ kind: 'error', text: t.waitlist[problem] });
      return;
    }
    setStatus({ kind: 'sending' });
    const result = await joinWaitlist(form, lang);
    setStatus(
      result.ok ? { kind: 'done' } : { kind: 'error', text: result.message ?? t.waitlist.failed },
    );
  }

  return (
    <section id="waitlist" className="section waitlist" aria-labelledby="waitlist-title">
      <div className="container waitlist-card">
        <div>
          <h2 id="waitlist-title">{t.waitlist.title}</h2>
          <p className="muted">{t.waitlist.body}</p>
        </div>
        {status.kind === 'done' ? (
          <p className="form-done" role="status">
            {t.waitlist.done}
          </p>
        ) : (
          <form className="form" onSubmit={submit} noValidate>
            <label className="field">
              <span>{t.waitlist.email}</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder={t.waitlist.emailPlaceholder}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t.waitlist.name}</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            {/* Hidden from people (and screen readers); only bots fill it. */}
            <label className="trap" aria-hidden="true">
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
              />
              <span>
                {t.waitlist.consent} <a href={pathOf(lang, 'privacy')}>{t.waitlist.consentLink}</a>
              </span>
            </label>
            {status.kind === 'error' ? (
              <p className="form-error" role="alert">
                {status.text}
              </p>
            ) : null}
            <button
              className="button button-primary"
              type="submit"
              disabled={status.kind === 'sending'}
            >
              {status.kind === 'sending' ? t.waitlist.sending : t.waitlist.submit}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
