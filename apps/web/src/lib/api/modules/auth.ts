import { clearAuthToken, setAuthToken } from '../../auth/token-storage';
import {
  loginResponseSchema,
  sessionResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type SessionResponse,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface AuthApi {
  login: (
    payload: LoginRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<LoginResponse>;
  logout: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<void>;
  getSession: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<SessionResponse>;
}

export function createAuthApi(transport: ApiTransport): AuthApi {
  return {
    async login(payload, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.AUTH_LOGIN, {
        method: 'POST',
        body: payload,
        signal: config?.signal,
      });
      const parsed = loginResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Login response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      if (parsed.data.token) {
        setAuthToken(parsed.data.token);
      }
      return parsed.data;
    },

    async logout(config) {
      try {
        await transport.request<void>(PLANNED_ENDPOINTS.AUTH_LOGOUT, {
          method: 'POST',
          signal: config?.signal,
        });
      } finally {
        clearAuthToken();
      }
    },

    async getSession(config) {
      try {
        const data = await transport.request<unknown>(PLANNED_ENDPOINTS.AUTH_SESSION, {
          signal: config?.signal,
        });
        const parsed = sessionResponseSchema.safeParse(data);
        if (!parsed.success) {
          throw new ApiClientError({
            message: 'Session response did not match the expected contract.',
            status: null,
            code: 'INVALID_RESPONSE',
            details: parsed.error.issues,
          });
        }
        return parsed.data;
      } catch (err) {
        // If unauthenticated or token expired, return null user cleanly
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 404)) {
          clearAuthToken();
          return {
            user: null,
            serverTime: new Date().toISOString(),
          };
        }
        throw err;
      }
    },
  };
}
