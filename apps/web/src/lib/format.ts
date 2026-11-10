import { ChallengeTrack } from 'api-contracts';

/**
 * Presentation helpers for the participant portal.
 * All timestamps are rendered in UTC (ISO 8601 convention) and independent of
 * the viewer's locale/timezone — the backend owns event time (AGENTS.md §2).
 */

const TRACK_LABELS: Record<ChallengeTrack, string> = {
  [ChallengeTrack.TrackA]: 'Track A',
  [ChallengeTrack.TrackB]: 'Track B',
};

/** Human label for a challenge track, or a placeholder while unassigned. */
export function getTrackLabel(track: ChallengeTrack | null | undefined): string {
  if (!track) {
    return 'Unassigned';
  }
  return TRACK_LABELS[track] ?? 'Unassigned';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formats an ISO 8601 UTC timestamp as `YYYY-MM-DD HH:MM UTC`.
 * Returns a dash placeholder for missing/unparseable values.
 */
export function formatUtcTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  return `${y}-${m}-${d} ${h}:${min} UTC`;
}
