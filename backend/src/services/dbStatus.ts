import mongoose from 'mongoose';

const stateNames: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/** Live database status: connection state plus a ping round trip. */
export async function getDbStatus(): Promise<{
  ok: boolean;
  state: string;
  name?: string;
  latencyMs?: number;
}> {
  const readyState = mongoose.connection.readyState as number;
  const state = stateNames[readyState] ?? 'unknown';
  const db = mongoose.connection.db;
  if (readyState !== 1 || !db) {
    return { ok: false, state };
  }
  try {
    const started = Date.now();
    await db.admin().ping();
    return { ok: true, state, name: db.databaseName, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, state };
  }
}
