/**
 * Generic API response envelope.
 *
 * Timestamps across the API are ISO 8601 UTC strings. Countdowns must be
 * computed from server-provided time, never from client clocks.
 */
import { z } from 'zod';

export const isoTimestampSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

export type IsoTimestamp = string;

export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
  });
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}
