import { z } from 'zod';

/**
 * Contract for `GET /api/health`.
 * See `docs/api/` for the full API documentation.
 */

export const databaseHealthSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().optional(),
});

export type DatabaseHealth = z.infer<typeof databaseHealthSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeSeconds: z.number(),
  /** ISO 8601 UTC timestamp, server-provided. */
  timestamp: z.string(),
  database: databaseHealthSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
