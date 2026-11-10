import type { Request, Response } from 'express';

/** 404 handler for unmatched routes, using the API error contract. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot find ${req.method} ${req.originalUrl}.`,
    },
  });
}
