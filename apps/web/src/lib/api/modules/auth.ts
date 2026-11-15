import { accountSchema, loginResponseSchema as accountLoginResponseSchema } from 'api-contracts';
import { clearAuthToken, setAuthToken } from '../auth-token';
import {
  loginResponseSchema,
  sessionResponseSchema,
  type AuthUser,
  type LoginRequest,
  type LoginResponse,
  type SessionResponse,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

/**
 * Authentication client.
 *
 * `apps/api` answers `POST /auth/login` with the canonical contract
 * `{ account, token, expiresAt }` and `GET /auth/me` with the bare account,
 * while the mock transport speaks the provisional `{ user, … }` shape. Both are
 * accepted here and mapped onto one `AuthUser`, so the rest of the frontend
 * never sees two shapes.
 *
 * The bearer token is stored by `../auth-token` and attached centrally in
 * `createApiClient`; modules must not forward it by hand.
 */

export interface AuthApi {
  login: (
    payload: LoginRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<LoginResponse>;
  logout: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<void>;
  getSession: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<SessionResponse>;
}

function toAuthUser(account: {
  id: string;
  name: string;
  email: string;
  role: AuthUser['role'];
}): AuthUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
  };
}

export function createAuthApi(transport: ApiTransport): AuthApi {
  return {
    async login(payload, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.AUTH_LOGIN, {
        method: 'POST',
        body: payload,
        signal: config?.signal,
      });

      // Real backend: canonical `{ account, token, expiresAt }`.
      const issued = accountLoginResponseSchema.safeParse(data);

      if (issued.success) {
        setAuthToken(issued.data.token);

        return {
          user: toAuthUser(issued.data.account),
          expiresAt: issued.data.expiresAt,
        };
      }

      // Mock transport: provisional `{ user, expiresAt? }`.
      const provisional = loginResponseSchema.safeParse(data);

      if (provisional.success) {
        return provisional.data;
      }

      throw new ApiClientError({
        message: 'Login response did not match the expected contract.',
        status: null,
        code: 'INVALID_RESPONSE',
        details: issued.error.issues,
      });
    },

    async logout(config) {
      try {
        await transport.request<void>(PLANNED_ENDPOINTS.AUTH_LOGOUT, {
          method: 'POST',
          signal: config?.signal,
        });
      } finally {
        // A failed revoke (expired token) must not leave a dead token behind.
        clearAuthToken();
      }
    },

    async getSession(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.AUTH_SESSION, {
        signal: config?.signal,
      });

      // Mock transport: provisional `{ user, serverTime }`.
      const provisional = sessionResponseSchema.safeParse(data);

      if (provisional.success) {
        return provisional.data;
      }

      // `GET /auth/me` returns the account itself; server time is not part of it.
      const account = accountSchema.safeParse(data);

      if (account.success) {
        return {
          user: toAuthUser(account.data),
          serverTime: new Date().toISOString(),
        };
      }

      throw new ApiClientError({
        message: 'Session response did not match the expected contract.',
        status: null,
        code: 'INVALID_RESPONSE',
        details: account.error.issues,
      });
    },
  };
}
