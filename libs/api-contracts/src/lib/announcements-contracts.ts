import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Contract for the announcements module:
 * - `POST /api/announcements` — admin publishes a live announcement
 * - `GET  /api/announcements` — any authenticated role reads the feed
 *
 * Real-time delivery transport is pending (OPEN_QUESTIONS #7); polling this
 * endpoint with server timestamps is the interim contract.
 */

const ANNOUNCEMENT_BODY_MAX = 500;

export const announcementBodySchema = z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX);

export const createAnnouncementRequestSchema = z.strictObject({
  body: announcementBodySchema,
});

export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;

export const announcementSchema = z.object({
  id: z.uuid(),
  body: announcementBodySchema,
  /** ISO 8601 UTC instant at which the announcement went live. */
  publishedAt: isoTimestampSchema,
  authorName: z.string(),
});

export type Announcement = z.infer<typeof announcementSchema>;
