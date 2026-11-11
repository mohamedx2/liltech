// Type augmentation for Express request context.
// Request IDs are set by the request-logger middleware for correlation.
// `user` is set by the auth middleware once a valid bearer token is verified.

import type { Role } from 'api-contracts';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        role: Role;
        name: string;
        email: string;
      };
    }
  }
}

export {};
