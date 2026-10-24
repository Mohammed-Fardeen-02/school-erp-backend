import { env } from './env';

export const databaseConfig = {
  url: env.DATABASE_URL,
  maxConnections: 20,
  idleTimeout: 30000,
  connectionTimeout: 5000,
};
