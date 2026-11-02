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

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  prefix?: string;
  message?: string;
}

export function rateLimiter(options?: RateLimiterOptions) {
  const windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options?.max ?? env.RATE_LIMIT_MAX_REQUESTS;
  const prefix = options?.prefix ?? 'global';
  const customMessage = options?.message;

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, bypass rate limiter
    if (env.NODE_ENV === 'test') {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:${prefix}:${clientIp}`;
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
      const waitSeconds = Math.ceil((record.resetTime - now) / 1000);
      return next(
        AppError.rateLimit(
          customMessage || `Too many requests from this IP. Please try again in ${waitSeconds} seconds.`
        )
      );
    }

    next();
  };
}

/**
 * Dedicated Rate Limiter for Authentication Sign-in:
 * 5 attempts per 15 minutes per IP.
 */
export const loginRateLimiter = rateLimiter({
  prefix: 'auth_login',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
});

/**
 * Dedicated Rate Limiter for Forgot Password:
 * 3 requests per 15 minutes per IP.
 */
export const forgotPasswordRateLimiter = rateLimiter({
  prefix: 'auth_forgot',
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Too many password reset requests. Please wait 15 minutes before trying again.',
});

/**
 * Dedicated Rate Limiter for Password Reset Consumption:
 * 5 attempts per 15 minutes per IP.
 */
export const resetPasswordRateLimiter = rateLimiter({
  prefix: 'auth_reset',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please wait 15 minutes before trying again.',
});

/**
 * Dedicated Rate Limiter for Refresh Token Rotation:
 * 30 requests per 15 minutes per IP.
 */
export const refreshRateLimiter = rateLimiter({
  prefix: 'auth_refresh',
  windowMs: 15 * 60 * 1000,
  max: 30,
});
