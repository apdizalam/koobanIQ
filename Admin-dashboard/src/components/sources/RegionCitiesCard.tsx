import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/authContext';
import { ApiError } from '../../services/api';
import { parseCityLines, updateRegionCities } from '../../services/jobSourcesApi';
import type { Region } from '../../types/jobSources';

/** One region's city suggestions as a text box (one city per line) with Save. */
export function RegionCitiesCard({ region }: { region: Region }) {
  const { t } = useTranslation();
  const { request } = useAuth();
  const [saved, setSaved] = useState(region.cities);
  const [text, setText] = useState(region.cities.join('\n'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);

  const name = t(`common.region.${region.key}`);
  const { cities, problem } = parseCityLines(text);
  const unchanged = cities.join('\n') === saved.join('\n');
  const inputId = `cities-${region.key}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problem) return;
    if (unchanged) {
      setMessage({ kind: 'notice', text: t('admin.regions.unchanged') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const updated = await updateRegionCities(request, region.key, cities);
      setSaved(updated.cities);
      setText(updated.cities.join('\n'));
      setMessage({ kind: 'notice', text: t('admin.regions.saved', { region: name }) });
    } catch (err) {
      // The server answers in the admin's language (TIQ-30).
      setMessage({
        kind: 'alert',
        text: err instanceof ApiError ? err.message : t('admin.errors.generic'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card region-card" onSubmit={submit} noValidate>
      <label className="select-field" htmlFor={inputId}>
        <span>{t('admin.regions.citiesLabel', { region: name })}</span>
      </label>
      <textarea
        id={inputId}
        className="input textarea"
        rows={8}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        disabled={busy}
        aria-invalid={problem !== null}
        aria-describedby={`${inputId}-count`}
      />
      <p id={`${inputId}-count`} className="muted region-count">
        {t('admin.regions.count', { count: cities.length })}
      </p>
      {problem ? (
        <p className="alert" role="alert">
          {t(`admin.regions.${problem}`)}
        </p>
      ) : null}
      {message ? (
        <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          className="button-secondary"
          disabled={busy || problem !== null || unchanged}
        >
          {busy ? t('admin.regions.saving') : t('admin.regions.save')}
        </button>
      </div>
    </form>
  );
}
