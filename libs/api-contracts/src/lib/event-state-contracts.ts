import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { eventPhaseSchema } from './event-state.js';

/**
 * Contract for the event-state module:
 * - `GET /api/event-state` — public: current phase + authoritative server time
 * - `POST /api/event-state` — admin: transitions the phase (audited)
 *
 * The backend is the single writer of event phase state; clients only read.
 */

export const eventStateResponseSchema = z.strictObject({
  phase: eventPhaseSchema,
  /** ISO 8601 UTC instant at which the current phase was entered. */
  phaseChangedAt: isoTimestampSchema,
  /** ISO 8601 UTC instant of the response — the platform's authoritative clock. */
  serverTime: isoTimestampSchema,
});

export type EventStateResponse = z.infer<typeof eventStateResponseSchema>;

/**
 * Phases normally advance one step at a time. Skipping ahead or going back
 * needs `force: true` (an audited administrative override).
 */
export const updateEventStateRequestSchema = z.strictObject({
  phase: eventPhaseSchema,
  force: z.boolean().optional(),
});

export type UpdateEventStateRequest = z.infer<typeof updateEventStateRequestSchema>;
