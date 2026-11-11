import { Router, type Request, type Response, type NextFunction } from 'express';
import { loginRequestSchema } from 'api-contracts';
import type { LoginResponse, MeResponse } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { createRateLimiter } from '../../utils/rate-limiter';
import { requireAuth } from '../../middleware/auth';
import { login, revokeSession } from './auth.service';

/**
 * Authentication endpoints.
 * - `POST /api/auth/login`  — rate-limited credential exchange for a session token
 * - `POST /api/auth/logout` — revokes the presented token
 * - `GET  /api/auth/me`     — the authenticated account
 */

/** Server-side counter: per client IP, a small burst only. */
const loginRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export const authRouter: Router = Router();

authRouter.post('/auth/login', (req: Request, res: Response, next: NextFunction) => {
  const key = `login|${req.ip ?? 'unknown'}`;
  const result = loginRateLimiter.check(key);

  if (!result.ok) {
    next(ApiError.rateLimited());
    return;
  }

  const input = loginRequestSchema.safeParse(req.body);

  if (!input.success) {
    next(
      ApiError.badRequest(
        'The request payload is invalid.',
        input.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      ),
    );
    return;
  }

  login(input.data.email, input.data.password)
    .then((issued) => {
      const body: LoginResponse = {
        account: {
          id: issued.user.id,
          role: issued.user.role,
          name: issued.user.name,
          email: issued.user.email,
        },
        token: issued.token,
        expiresAt: issued.expiresAt.toISOString(),
      };
      res.status(200).json(body);
    })
    .catch(next);
});

authRouter.post('/auth/logout', requireAuth, (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;

  if (!token) {
    next(ApiError.unauthorized());
    return;
  }

  revokeSession(token)
    .then(() => {
      res.status(204).send();
    })
    .catch(next);
});

authRouter.get('/auth/me', requireAuth, (req, res, next) => {
  const user = req.user;

  if (!user) {
    next(ApiError.unauthorized());
    return;
  }

  const body: MeResponse = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  };
  res.status(200).json(body);
});
