import {
  loginRequestSchema,
  type LoginResponse,
  type SessionResponse,
} from '../../contracts/pending';
import { PLANNED_ENDPOINTS } from '../../endpoints';
import { ApiClientError } from '../../errors';
import { DEV_MOCK_USERS, devMockState } from './dev-state';
import type { MockRouteMap } from './types';

export function createAuthMockRoutes(): MockRouteMap {
  return {
    [`GET ${PLANNED_ENDPOINTS.AUTH_SESSION}`]: (): SessionResponse => ({
      user: devMockState.currentUser,
      serverTime: new Date().toISOString(),
    }),

    [`POST ${PLANNED_ENDPOINTS.AUTH_LOGIN}`]: (config): LoginResponse => {
      const parsed = loginRequestSchema.safeParse(config.body);
      if (!parsed.success) {
        throw new ApiClientError({
          message: parsed.error.issues[0]?.message ?? 'Invalid login input.',
          status: 400,
          code: 'VALIDATION_ERROR',
          details: parsed.error.issues,
        });
      }

      const email = parsed.data.email.toLowerCase();
      const matched =
        DEV_MOCK_USERS.find((user) => user.email === email) ??
        devMockState.registeredTeamEmails.get(email) ??
        null;

      if (!matched || parsed.data.password.length < 4) {
        throw new ApiClientError({
          message:
            'Invalid mock credentials. In mock mode use team@liltech.mock, jury@liltech.mock, or admin@liltech.mock.',
          status: 401,
          code: 'UNAUTHORIZED',
        });
      }

      devMockState.currentUser = matched;

      return {
        user: matched,
      };
    },

    [`POST ${PLANNED_ENDPOINTS.AUTH_LOGOUT}`]: (): void => {
      devMockState.currentUser = null;
    },
  };
}
