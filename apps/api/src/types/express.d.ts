// Type augmentation for Express request context.
// Request IDs are set by the request-logger middleware for correlation.

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export {};
