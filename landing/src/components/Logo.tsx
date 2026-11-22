/** The KOBANIQ mark: the target on a steel-blue tile, as in the app (design 01 · Welcome). */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="12" fill="#4682B4" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="24" cy="24" r="7.5" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="24" cy="24" r="2.8" fill="#fff" />
    </svg>
  );
}
