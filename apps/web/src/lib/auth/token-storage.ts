/**
 * Persistent client-side session token storage.
 *
 * Keeps the opaque session token issued by `POST /api/auth/login` in localStorage
 * with in-memory fallback for SSR or environments where localStorage is restricted.
 */

const TOKEN_STORAGE_KEY = 'liltech_auth_token';

let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) return stored;
    } catch {
      // Ignore localStorage access restrictions (e.g. iframe sandbox, private browsing)
    }
  }
  return memoryToken;
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage write failures
    }
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}
