import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Red confirm button for actions that cannot be undone. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "Are you sure?" box using the browser's <dialog> (focus trap, Esc to cancel,
 * page behind made inert).
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <p className="dialog-message">{message}</p>
      <div className="dialog-actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'button-danger' : 'button-primary'}
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
