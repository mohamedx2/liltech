import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../utils/logger';
import { randomUUID } from 'node:crypto';

/**
 * Structured request logging with correlation IDs.
 * Every request gets an `x-request-id` so client-reported issues can be traced
 * back to exact log lines.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function requestLogger(log: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // A client-supplied id is kept only when it is short and log-safe.
    const supplied = req.headers['x-request-id'];
    const requestId =
      typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
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
