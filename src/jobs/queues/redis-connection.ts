import Redis, { RedisOptions } from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../core/logger/app-logger';

let redisClient: Redis | null = null;

export const redisConnectionOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    if (env.NODE_ENV !== 'production' && times > 2) {
      // In development, stop retrying quickly to avoid log spam
      return null;
    }
    return Math.min(times * 200, 3000);
  },
};

/**
 * Fast probe to verify if Redis is reachable before starting persistent workers
 */
export async function isRedisReachable(timeoutMs = 600): Promise<boolean> {
  if (!env.REDIS_HOST) return false;

  return new Promise<boolean>((resolve) => {
    const probe = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: timeoutMs,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });

    const timer = setTimeout(() => {
      try {
        probe.disconnect();
      } catch {}
      resolve(false);
    }, timeoutMs);

    probe
      .connect()
      .then(async () => {
        const ping = await probe.ping();
        clearTimeout(timer);
        try {
          probe.disconnect();
        } catch {}
        resolve(ping === 'PONG');
      })
      .catch(() => {
        clearTimeout(timer);
        try {
          probe.disconnect();
        } catch {}
        resolve(false);
      });
  });
}

/**
 * Returns a shared ioredis client instance with lazy connection and offline resilience
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisConnectionOptions);

    redisClient.on('error', (err) => {
      if (env.NODE_ENV === 'production') {
        logger.error({ err }, '[Redis] Critical connection error in production environment');
      }
    });

    redisClient.on('connect', () => {
      logger.info('[Redis] Successfully connected to Redis instance');
    });
  }

  return redisClient;
}

/**
 * Creates connection options for BullMQ queues and workers
 */
export function getBullMqConnection(): RedisOptions {
  return redisConnectionOptions;
}
