import { z } from 'zod';
import { issueBadgeResponseSchema } from './checkin-contracts.js';
import { teamResponseSchema } from './registration-contracts.js';

/**
 * Response of `POST /api/registration/teams`: the created team plus one QR
 * badge per participant. Raw badge tokens are presented exactly once — the
 * server stores only their hashes — so the client must surface them to the
 * team leader. Email delivery is pending (open question 8).
 *
 * Lives in its own module because `checkin-contracts` already depends on
 * `registration-contracts`.
 */
export const teamRegistrationResponseSchema = teamResponseSchema.extend({
  badges: z.array(issueBadgeResponseSchema),
});

export type TeamRegistrationResponse = z.infer<typeof teamRegistrationResponseSchema>;
