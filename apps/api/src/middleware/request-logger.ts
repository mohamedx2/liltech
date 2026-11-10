import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../utils/logger';
import { randomUUID } from 'node:crypto';

/**
 * Structured request logging with correlation IDs.
 * Every request gets an `x-request-id` so client-reported issues can be traced
 * back to exact log lines.
 */
export function requestLogger(log: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      log[level](
        {
          requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        },
        'request completed',
      );
    });

    next();
  };
}
