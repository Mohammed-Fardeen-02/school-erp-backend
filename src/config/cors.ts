import { CorsOptions } from 'cors';
import { env } from './env';
import { logger } from '../core/logger/app-logger';

/**
 * Normalizes an origin URL by trimming whitespace and trailing slashes.
 */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (like curl, Postman, server-to-server) where origin is undefined
    if (!origin || env.CORS_ORIGIN === '*') {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    const allowedOrigins = env.CORS_ORIGIN.split(',')
      .map(normalizeOrigin)
      .filter(Boolean);

    // If wildcard origin exists in list
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Direct match against configured allowed origins
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // In development or test environments, allow local development origins (localhost / 127.0.0.1 on any port)
    if (env.NODE_ENV !== 'production') {
      const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);
      if (isLocalOrigin) {
        return callback(null, true);
      }
    }

    // Origin is not allowed
    logger.warn(
      { origin, normalizedOrigin, allowedOrigins },
      'Cross-Origin Request rejected by CORS Policy'
    );
    // Returning false cleanly denies CORS preflight without triggering unhandled 500 exceptions
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-School-Id',
    'X-Request-Id',
    'X-Organization-Id',
    'X-Location-Id',
    'X-Platform-Override',
    'X-Override-Reason',
    'X-Platform-Module-Bypass',
    'X-Correlation-Id',
  ],
  exposedHeaders: ['X-Request-Id', 'X-Total-Count', 'Content-Range'],
};

