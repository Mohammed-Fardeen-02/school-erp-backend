import { env } from './env';

export const loggerConfig = {
  level: env.LOG_LEVEL,
  isProduction: env.NODE_ENV === 'production',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'refreshToken'],
};
