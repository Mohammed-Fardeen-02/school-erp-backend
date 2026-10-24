import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { AppError } from '../errors/app-error';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Periodically clean up expired records to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

export function rateLimiter(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options?.max ?? env.RATE_LIMIT_MAX_REQUESTS;

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, bypass rate limiter
    if (env.NODE_ENV === 'test') {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:${clientIp}`;
    const now = Date.now();

    const record = memoryStore.get(key);

    if (!record || now > record.resetTime) {
      memoryStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      return next();
    }

    record.count += 1;

    const remaining = Math.max(0, maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > maxRequests) {
      return next(
        AppError.rateLimit(
          `Rate limit exceeded. Try again in ${Math.ceil((record.resetTime - now) / 1000)} seconds.`
        )
      );
    }

    next();
  };
}
