import type { SourceAdapter } from './types.js';

/**
 * Adapters that ship with the server, one file each in this folder. A source can
 * only be enabled (and searched) when its adapter is listed here.
 * Empty until the first real source passes its terms check (TIQ-32 slice 3).
 */
const BUILT_IN_ADAPTERS: SourceAdapter[] = [];

const adapters = new Map<string, SourceAdapter>(BUILT_IN_ADAPTERS.map((a) => [a.key, a]));

export function getAdapter(key: string): SourceAdapter | undefined {
  return adapters.get(key);
}

export const hasAdapter = (key: string) => adapters.has(key);

/** For tests only: plug in a fake source adapter, and remove it again. */
export function registerAdapter(adapter: SourceAdapter) {
  adapters.set(adapter.key, adapter);
}
export function unregisterAdapter(key: string) {
  adapters.delete(key);
}
