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
  REGISTRATIONS: '/registrations',
} as const;
