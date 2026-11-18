import { useCallback, useEffect, useState } from 'react';

/**
 * Seconds left before an action may run again (e.g. "send a new code": the
 * server sends at most one code a minute). `start()` begins the wait;
 * `startNow` begins it immediately (a code was just sent).
 */
export function useCooldown(seconds: number, { startNow = false } = {}) {
  const [left, setLeft] = useState(startNow ? seconds : 0);

  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const start = useCallback(() => setLeft(seconds), [seconds]);
  return { left, start };
}
