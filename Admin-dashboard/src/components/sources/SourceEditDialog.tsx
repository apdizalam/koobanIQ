import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { parsePriority, sourceChanges } from '../../services/jobSourcesApi';
import {
  EMPLOYER_TYPES,
  REGION_KEYS,
  type AdminJobSource,
  type EmployerType,
  type RegionKey,
  type SourceChanges,
} from '../../types/jobSources';

interface SourceEditDialogProps {
  /** The source being edited, or null when the dialog is closed. */
  source: AdminJobSource | null;
  busy: boolean;
  /** Server error to show inside the dialog. */
  error: string | null;
  onSave: (changes: Omit<SourceChanges, 'enabled'>) => void;
  onCancel: () => void;
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Edit a source's regions, employer types and display order (doc 9 §8). */
export function SourceEditDialog({ source, busy, error, onSave, onCancel }: SourceEditDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = source !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog dialog-wide"
      aria-labelledby="source-edit-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {source ? (
        // A fresh form for every source, so its fields start from that source.
        <EditForm
          key={source.key}
          source={source}
          busy={busy}
          error={error}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : null}
    </dialog>
  );
}

function EditForm({
  source,
  busy,
  error,
  onSave,
  onCancel,
}: Omit<SourceEditDialogProps, 'source'> & { source: AdminJobSource }) {
  const { t } = useTranslation();
  const [regions, setRegions] = useState<RegionKey[]>(source.regions);
  const [employerTypes, setEmployerTypes] = useState<EmployerType[]>(source.employerTypes);
  const [priorityText, setPriorityText] = useState(String(source.priority));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const priority = parsePriority(priorityText);
    if (regions.length === 0) return setProblem(t('admin.sources.needRegion'));
    if (priority === null) return setProblem(t('admin.sources.badPriority'));
    const changes = sourceChanges(source, { regions, employerTypes, priority });
    if (Object.keys(changes).length === 0) return setProblem(t('admin.sources.noChanges'));
    setProblem(null);
    onSave(changes);
  }

  const message = problem ?? error;
  return (
    <form onSubmit={submit} noValidate>
      <h2 id="source-edit-title" className="dialog-title">
        {t('admin.sources.editTitle', { name: source.name })}
      </h2>

      <fieldset className="check-group">
        <legend>{t('admin.sources.regionsLabel')}</legend>
        {REGION_KEYS.map((key) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={regions.includes(key)}
              onChange={() => setRegions((list) => toggle(list, key))}
              disabled={busy}
            />
            {t(`common.region.${key}`)}
          </label>
        ))}
      </fieldset>

      <fieldset className="check-group">
        <legend>{t('admin.sources.employerTypesLabel')}</legend>
        {EMPLOYER_TYPES.map((key) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={employerTypes.includes(key)}
              onChange={() => setEmployerTypes((list) => toggle(list, key))}
              disabled={busy}
            />
            {t(`common.employerType.${key}`)}
          </label>
        ))}
      </fieldset>

      <label className="select-field">
        <span>{t('admin.sources.priorityLabel')}</span>
        <input
          className="input input-narrow"
          inputMode="numeric"
          value={priorityText}
          onChange={(e) => setPriorityText(e.target.value)}
          disabled={busy}
        />
      </label>

      {message ? (
        <p className="alert dialog-alert" role="alert">
          {message}
        </p>
      ) : null}

      <div className="dialog-actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>
          {t('admin.sources.cancel')}
        </button>
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? t('admin.sources.saving') : t('admin.sources.save')}
        </button>
      </div>
    </form>
  );
}
