import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  /** null while loading (shows a placeholder bar). */
  value: number | null;
  hint?: ReactNode;
}

const format = new Intl.NumberFormat('en');

/** One KPI tile: label, big number, small hint underneath. */
export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <article className="stat-card" aria-busy={value === null}>
      <p className="stat-label">{label}</p>
      {value === null ? (
        <span className="stat-skeleton" aria-hidden="true" />
      ) : (
        <p className="stat-value">{format.format(value)}</p>
      )}
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </article>
  );
}

interface SoonCardProps {
  label: string;
  note: string;
}

/** A KPI that cannot be counted yet because its feature is not built. */
export function SoonCard({ label, note }: SoonCardProps) {
  return (
    <article className="stat-card stat-card-soon">
      <p className="stat-label">{label}</p>
      <p className="stat-hint">{note}</p>
    </article>
  );
}
