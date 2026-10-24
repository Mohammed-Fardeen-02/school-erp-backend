import pino from 'pino';
import { loggerConfig } from '../../config/logger';

export const logger = pino({
  level: loggerConfig.level,
  redact: loggerConfig.redact,
  transport: !loggerConfig.isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
