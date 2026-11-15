/**
 * Session-token store for the browser.
 *
 * The API issues an opaque bearer token on login; every authenticated request
 * must return it as `Authorization: Bearer <token>`. It is held in memory and
 * mirrored into `sessionStorage` — not `localStorage` — so it dies with the tab
 * instead of outliving the event device, and a reload keeps the user signed in.
 *
 * Only `lib/api` may read or write it. Treat the value as a credential: never
 * log it, never render it, never put it in a URL.
 */

const STORAGE_KEY = 'liltech.session.token';

let inMemory: string | null = null;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    // Storage can throw when cookies/partitioning are blocked; memory still works.
    return null;
  }
}

export function getAuthToken(): string | null {
  const store = storage();

  if (!store) return inMemory;

  try {
    return store.getItem(STORAGE_KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}

export function setAuthToken(token: string): void {
  inMemory = token;
  const store = storage();

  try {
    store?.setItem(STORAGE_KEY, token);
  } catch {
    // Keep the in-memory token; the session simply won't survive a reload.
  }
}

export function clearAuthToken(): void {
  inMemory = null;
  const store = storage();

  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}
