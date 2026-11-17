import { useCallback, useEffect, useState } from 'react';

export type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };
type Result<T> = { status: 'error' } | { status: 'ready'; data: T };

/**
 * Loads data for `key`; anything stored for an older key counts as "loading".
 * `reload()` loads the same key again; meanwhile `previous` keeps the last data
 * so the page does not flicker. (No setState directly inside the effect.)
 */
export function useLoad<T>(key: string, load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: Result<T> } | null>(null);
  const fullKey = `${key}#${attempt}`;

  useEffect(() => {
    let active = true;
    load()
      .then((data) => active && setResult({ key: fullKey, value: { status: 'ready', data } }))
      .catch(() => active && setResult({ key: fullKey, value: { status: 'error' } }));
    return () => {
      active = false;
    };
    // `load` changes with `key`, which is part of fullKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state: Load<T> = result?.key === fullKey ? result.value : { status: 'loading' };
  const sameThing = result?.key.slice(0, result.key.lastIndexOf('#')) === key;
  const previous = sameThing && result?.value.status === 'ready' ? result.value.data : null;
  return { state, reload, previous };
}
