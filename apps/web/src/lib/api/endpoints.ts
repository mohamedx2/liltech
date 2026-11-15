/**
 * API endpoint registry relative to `NEXT_PUBLIC_API_URL` (e.g. `/api`).
 *
 * Only `IMPLEMENTED_ENDPOINTS` are guaranteed to exist on `apps/api` today.
 * `PLANNED_ENDPOINTS` correspond to planned module groups in `docs/api/README.md`
 * and must be updated to match finalized backend routes as modules ship.
 */

export const IMPLEMENTED_ENDPOINTS = {
  HEALTH: '/health',
} as const;

/**
 * Provisional paths for endpoint groups planned in `docs/api/README.md`.
 * In `real` mode, calling these before the backend implements them returns
 * `ApiClientError` (`404` / `NOT_FOUND`); in `mock` mode they hit dev mocks.
 */
export const PLANNED_ENDPOINTS = {
  EVENT_STATE: '/event-state',
  AUTH_LOGIN: '/auth/login',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_SESSION: '/auth/me',
  REGISTRATIONS: '/registration/teams',
  PARTICIPANTS_TEAM: '/participants/team',
  PARTICIPANTS_BADGE: '/participants/badge',
  MINI_CTF_STATUS: '/mini-ctf/status',
  MINI_CTF_SUBMIT: '/mini-ctf/submit',
  CHALLENGES_CURRENT: '/challenges/current',
  SUBMISSIONS: '/submissions',
  SUBMISSIONS_MY_TEAM: '/submissions/my-team',
  ANNOUNCEMENTS: '/announcements',
  JURY_OVERVIEW: '/jury/overview',
  JURY_TEAMS: '/jury/teams',
  JURY_EVALUATION: '/jury/evaluation',
  CHECKIN_SCAN: '/checkin/scan',
  CHECKIN_REVOKE: '/checkin/revoke',
  CHECKIN_BADGES: '/checkin/badges',
  ADMIN_AUDIT_LOG: '/admin/audit-log',
  ADMIN_TEAMS: '/admin/teams',
  ADMIN_JURY: '/admin/jury',
  ADMIN_OVERVIEW: '/admin/overview',
  ADMIN_PARTICIPANTS: '/admin/participants',
  ADMIN_BADGES_RESEND_FAILED: '/admin/badges/resend-failed',
  ADMIN_CHALLENGES: '/admin/challenges',
} as const;
