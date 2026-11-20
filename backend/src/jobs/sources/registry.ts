import { careerPagesAdapter } from './careerPages.js';
import type { SourceAdapter } from './types.js';

/**
 * Adapters that ship with the server, one file each in this folder. A source can
 * only be enabled (and searched) when its adapter is listed here.
 * Career pages (the user's links; free board APIs and JobPosting pages) for
 * now; ReliefWeb joins when its app name is approved.
 */
const BUILT_IN_ADAPTERS: SourceAdapter[] = [careerPagesAdapter];

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
