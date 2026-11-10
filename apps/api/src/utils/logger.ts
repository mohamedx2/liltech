import pino from 'pino';
import { env } from '../config/env';

/**
 * Structured JSON logging in every environment.
 * In development, logs are pretty-printed for readability.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { singleLine: true },
        },
      }
    : {}),
});

export type Logger = typeof logger;
