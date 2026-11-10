/**
 * Timestamp helpers.
 *
 * The platform convention is ISO 8601 UTC timestamps everywhere (see
 * `libs/api-contracts`). These helpers exist so this convention is easy to
 * follow and hard to get wrong.
 */

/** Current time as an ISO 8601 UTC string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Formats a date as an ISO 8601 UTC string. */
export function toIsoTimestamp(date: Date): string {
  return date.toISOString();
}

/** Parses an ISO 8601 timestamp. Returns `null` for invalid input. */
export function parseIsoTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
