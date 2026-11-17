import { PERIODS, type Period } from '../../types/overview';

interface PeriodSwitchProps {
  value: Period;
  onChange: (period: Period) => void;
  labels: Record<Period, string>;
  label: string;
}

/** Segmented Day / Week / Month / Year control (one button group, one pressed). */
export function PeriodSwitch({ value, onChange, labels, label }: PeriodSwitchProps) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          className={`segment${period === value ? ' segment-active' : ''}`}
          aria-pressed={period === value}
          onClick={() => onChange(period)}
        >
          {labels[period]}
        </button>
      ))}
    </div>
  );
}
