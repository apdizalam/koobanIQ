import mongoose from 'mongoose';
import { env } from '../config/env.js';

export interface ConnectOptions {
  uri?: string;
  dbName?: string;
  retries?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hide credentials when a connection string has to appear in a log line. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***:***@');
}

/**
 * Connect Mongoose to MongoDB Atlas, retrying with a linear backoff.
 * Throws after the last failed attempt so the caller can exit cleanly.
 */
export async function connectDB(options: ConnectOptions = {}): Promise<typeof mongoose> {
  const uri = options.uri ?? env.mongoUri;
  const dbName = options.dbName ?? env.mongoDbName;
  const retries = options.retries ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 3000;

  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env (see .env.example).');
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
      console.log(`MongoDB Atlas connected (db: ${dbName})`);
      return mongoose;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `MongoDB connection failed (attempt ${attempt}/${retries}) to ${redactUri(uri)}: ${message}`,
      );
      if (attempt === retries) {
        throw new Error(
          `Could not connect to MongoDB Atlas after ${retries} attempts. ` +
            'Check MONGODB_URI, the database user, and Atlas Network Access (IP allow list).',
        );
      }
      await sleep(retryDelayMs * attempt);
    }
  }
  throw new Error('unreachable');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
