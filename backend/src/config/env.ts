import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export type NodeEnv = 'development' | 'test' | 'staging' | 'production';

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV ?? 'development';
  if (value === 'development' || value === 'test' || value === 'staging' || value === 'production') {
    return value;
  }
  return 'development';
}

const nodeEnv = readNodeEnv();

/** Default Atlas database per environment (see doc 6 · Tech Stack). */
const defaultDbName: Record<NodeEnv, string> = {
  development: 'kobaniq_dev',
  test: 'kobaniq_test',
  staging: 'kobaniq_staging',
  production: 'kobaniq_prod',
};

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 5000),
  // MONGODB_URI is the documented name; MONGO_URI is accepted for existing local .env files.
  mongoUri: process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '',
  mongoDbName: process.env.MONGODB_DB_NAME ?? defaultDbName[nodeEnv],
};
