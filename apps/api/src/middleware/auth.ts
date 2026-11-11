import type { NextFunction, Request, Response } from 'express';
import type { Role } from 'api-contracts';
import { ApiError } from '../utils/api-error';
import { verifySessionToken } from '../modules/auth/auth.service';

/**
 * Authentication + role-based authorization middleware.
 *
 * All security decisions run here and in services — never on the client.
 * A verified bearer token places `req.user` on the request for the lifetime
 * of the request only.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized());
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  verifySessionToken(token)
    .then((user) => {
      if (!user) {
        throw ApiError.unauthorized();
      }
      req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
      next();
    })
    .catch(next);
}

/**
 * Declares exactly one required role for a protected route, per the API
 * specification. Combine after `requireAuth`.
 */
export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.user.role !== role) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };
}
