import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface StatCardProps {
  label: string;
  /** null while loading (shows a placeholder bar); a string is shown as written (e.g. "7.5/10"). */
  value: number | string | null;
  hint?: ReactNode;
}

/** One KPI tile: label, big number, small hint underneath. */
export function StatCard({ label, value, hint }: StatCardProps) {
  const { i18n } = useTranslation();
  return (
    <article className="stat-card" aria-busy={value === null}>
      <p className="stat-label">{label}</p>
      {value === null ? (
        <span className="stat-skeleton" aria-hidden="true" />
      ) : (
        <p className="stat-value">
          {typeof value === 'string' ? value : new Intl.NumberFormat(i18n.language).format(value)}
        </p>
      )}
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </article>
  );
}
