import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { REASON_MAX, reasonProblem } from '../../services/privacyApi';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  /** What will happen, shown above the reason box. */
  message: string;
  /** When set, a box the admin must tick before saving (e.g. allowing personal data). */
  confirmText?: string;
  saveLabel: string;
  busy: boolean;
  /** Server error to show inside the dialog. */
  error: string | null;
  danger?: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}

/**
 * A change that needs a written reason (10–500 characters, checked here and again
 * on the server), e.g. the AI privacy setting or a test-account mark.
 */
export function ReasonDialog(props: ReasonDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { open, busy, onCancel } = props;

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
      aria-label={props.title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {/* A fresh form every time it opens, so the reason box starts empty. */}
      {open ? <ReasonForm {...props} /> : null}
    </dialog>
  );
}

function ReasonForm({
  title,
  message,
  confirmText,
  saveLabel,
  busy,
  error,
  danger = false,
  onSave,
  onCancel,
}: ReasonDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const bad = reasonProblem(reason);
    if (bad) return setProblem(t(`admin.privacy.${bad}`));
    if (confirmText && !confirmed) return setProblem(t('admin.privacy.confirmNeeded'));
    setProblem(null);
    onSave(reason.trim());
  }

  const shown = problem ?? error;
  return (
    <form onSubmit={submit} noValidate>
      <h2 className="dialog-title">{title}</h2>
      <p className="dialog-message">{message}</p>

      <label className="field" htmlFor={`${id}-reason`}>
        {t('admin.privacy.reason')}
      </label>
      <textarea
        id={`${id}-reason`}
        className="input textarea textarea-short"
        value={reason}
        maxLength={REASON_MAX + 100}
        onChange={(e) => setReason(e.target.value)}
        aria-describedby={`${id}-hint`}
        disabled={busy}
        autoFocus
      />
      <p id={`${id}-hint`} className="muted field-hint">
        {t('admin.privacy.reasonHint')} {reason.trim().length}/{REASON_MAX}
      </p>

      {confirmText ? (
        <label className="check confirm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
          />
          {confirmText}
        </label>
      ) : null}

      {shown ? (
        <p className="alert dialog-alert" role="alert">
          {shown}
        </p>
      ) : null}

      <div className="dialog-actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>
          {t('admin.privacy.cancel')}
        </button>
        <button
          type="submit"
          className={danger ? 'button-danger' : 'button-primary'}
          disabled={busy}
        >
          {busy ? t('admin.privacy.saving') : saveLabel}
        </button>
      </div>
    </form>
  );
}
