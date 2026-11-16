import { CorsOptions } from 'cors';
import { env } from './env';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || env.CORS_ORIGIN === '*') {
      return callback(null, true);
    }
    const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Cross-Origin Request Blocked by CORS Policy'));
    }
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
