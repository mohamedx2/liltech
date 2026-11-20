import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';
import { createAuthMockRoutes } from './mocks/auth.mock';
import { createEventsMockRoutes } from './mocks/events.mock';
import { createHealthMockRoutes } from './mocks/health.mock';
import { createRegistrationsMockRoutes } from './mocks/registrations.mock';
import { handleGetAdminCtf } from './mocks/admin-ctf.mock';
import { handleGetAnnouncements } from './mocks/announcements.mock';
import { handleGetCurrentChallenge } from './mocks/challenges.mock';
import { handleGetBadges, handleRevokeBadge, handleScanCheckIn } from './mocks/checkin.mock';
import {
  handleGetAdminChallenges,
  handleGetAdminJury,
  handleGetAdminOverview,
  handleGetAdminTeam,
  handleGetAdminTeams,
  handleGetAuditLog,
  handlePublishAdminAnnouncement,
  handleSendAllBadgeEmails,
} from './mocks/admin.mock';
import {
  handleGetJuryEvaluation,
  handleGetJuryOverview,
  handleGetJuryTeams,
  handleSubmitJuryEvaluation,
} from './mocks/jury.mock';
import { handleGetMiniCtfStatus, handleSubmitMiniCtfFlag } from './mocks/mini-ctf.mock';
import {
  handleGetCtfChain,
  handleGetCtfStage,
  handleRevealCtfHint,
  handleSubmitCtfAnswer,
} from './mocks/ctf.mock';
import { handleGetMyBadge, handleGetMyTeam } from './mocks/participants.mock';
import { handleCreateSubmission, handleGetSubmissionsOverview } from './mocks/submissions.mock';
import type { MockRouteMap } from './mocks/types';
import { PLANNED_ENDPOINTS } from '../endpoints';
import type {
  CreateSubmissionRequest,
  CtfSubmitRequest as CtfSubmitAnswerRequest,
} from 'api-contracts';
import type { MiniCtfSubmitRequest, SubmitEvaluationRequest } from '../contracts/pending';

export interface MockTransportOptions {
  /** Simulated network latency in milliseconds. */
  latencyMs?: number;
}

/**
 * In-memory mock transport. Lets UI work proceed without a running backend.
 *
 * Mocks never encode business rules that the backend owns — they exist so the
 * UI can be developed and tested before the API ships, and must never be used
 * as the source of truth for business logic — the API is.
 */
export function createMockTransport(options: MockTransportOptions = {}): ApiTransport {
  const latencyMs = options.latencyMs ?? 150;

  const routes: MockRouteMap = {
    ...createHealthMockRoutes(),
    ...createEventsMockRoutes(),
    ...createAuthMockRoutes(),
    ...createRegistrationsMockRoutes(),

    [`GET ${PLANNED_ENDPOINTS.PARTICIPANTS_TEAM}`]: () => handleGetMyTeam(),
    [`GET ${PLANNED_ENDPOINTS.PARTICIPANTS_BADGE}`]: () => handleGetMyBadge(),

    [`GET ${PLANNED_ENDPOINTS.MINI_CTF_STATUS}`]: () => handleGetMiniCtfStatus(),
    [`POST ${PLANNED_ENDPOINTS.MINI_CTF_SUBMIT}`]: (config) =>
      handleSubmitMiniCtfFlag((config.body ?? {}) as MiniCtfSubmitRequest),

    [`GET ${PLANNED_ENDPOINTS.CTF_CHAIN}`]: () => handleGetCtfChain(),

    [`GET ${PLANNED_ENDPOINTS.CHALLENGES_CURRENT}`]: () => handleGetCurrentChallenge(),

    [`GET ${PLANNED_ENDPOINTS.SUBMISSIONS}`]: () => handleGetSubmissionsOverview(),
    [`POST ${PLANNED_ENDPOINTS.SUBMISSIONS}`]: (config) =>
      handleCreateSubmission((config.body ?? {}) as CreateSubmissionRequest),

    [`GET ${PLANNED_ENDPOINTS.ANNOUNCEMENTS}`]: () => handleGetAnnouncements(),
    [`POST ${PLANNED_ENDPOINTS.ANNOUNCEMENTS}`]: (config) => {
      const body = (config.body ?? {}) as { body?: string };
      return handlePublishAdminAnnouncement(body.body ?? '');
    },

    [`GET ${PLANNED_ENDPOINTS.JURY_OVERVIEW}`]: () => handleGetJuryOverview(),
    [`GET ${PLANNED_ENDPOINTS.JURY_TEAMS}`]: () => handleGetJuryTeams(),
    [`GET ${PLANNED_ENDPOINTS.JURY_EVALUATION}`]: (config) => {
      const teamId = (config as { params?: Record<string, string> }).params?.teamId ?? '';
      return handleGetJuryEvaluation(teamId);
    },
    [`POST ${PLANNED_ENDPOINTS.JURY_EVALUATION}`]: (config) => {
      const teamId = (config as { params?: Record<string, string> }).params?.teamId ?? '';
      return handleSubmitJuryEvaluation(teamId, (config.body ?? {}) as SubmitEvaluationRequest);
    },

    [`POST ${PLANNED_ENDPOINTS.CHECKIN_SCAN}`]: (config) => {
      const body = (config.body ?? {}) as { token?: string };
      return handleScanCheckIn(body.token ?? '');
    },
    [`POST ${PLANNED_ENDPOINTS.CHECKIN_REVOKE}`]: (config) => {
      const body = (config.body ?? {}) as { participantId?: string };
      return handleRevokeBadge(body.participantId ?? '');
    },
    [`GET ${PLANNED_ENDPOINTS.CHECKIN_BADGES}`]: () => handleGetBadges(),

    [`GET ${PLANNED_ENDPOINTS.ADMIN_AUDIT_LOG}`]: (config) => {
      const params = (config as { params?: Record<string, string> }).params;
      const limit = params?.limit ? parseInt(params.limit, 10) : 50;
      const offset = params?.offset ? parseInt(params.offset, 10) : 0;
      return handleGetAuditLog(limit, offset);
    },

    [`GET ${PLANNED_ENDPOINTS.ADMIN_TEAMS}`]: () => handleGetAdminTeams(),
    [`GET ${PLANNED_ENDPOINTS.ADMIN_JURY}`]: () => handleGetAdminJury(),
    [`GET ${PLANNED_ENDPOINTS.ADMIN_OVERVIEW}`]: () => handleGetAdminOverview(),
    [`GET ${PLANNED_ENDPOINTS.ADMIN_CTF}`]: () => handleGetAdminCtf(),
    [`GET ${PLANNED_ENDPOINTS.ADMIN_CHALLENGES}`]: () => handleGetAdminChallenges(),
    [`POST ${PLANNED_ENDPOINTS.ADMIN_BADGES_SEND_ALL}`]: () => handleSendAllBadgeEmails(),
  };

  /** `/ctf/stages/<slug>` and its `hints` / `submit` sub-paths. */
  function ctfStageRoute(
    method: string,
    path: string,
    config: ApiRequestConfig,
  ): (() => unknown) | undefined {
    const match = /^\/ctf\/stages\/([^/]+)(\/(hints|submit))?$/.exec(path);

    if (!match) {
      return undefined;
    }

    const slug = decodeURIComponent(match[1]);

    if (!match[2] && method === 'GET') {
      return () => handleGetCtfStage(slug);
    }

    if (match[3] === 'hints' && method === 'POST') {
      return () => handleRevealCtfHint(slug);
    }

    if (match[3] === 'submit' && method === 'POST') {
      return () => handleSubmitCtfAnswer(slug, (config.body ?? {}) as CtfSubmitAnswerRequest);
    }

    return undefined;
  }

  /** Parameterized read routes (`:id` segments). Writes need the real API. */
  const patternRoutes: ReadonlyArray<{
    method: string;
    pattern: RegExp;
    handle: (match: RegExpMatchArray) => unknown;
  }> = [
    {
      method: 'GET',
      pattern: /^\/admin\/teams\/([^/]+)$/,
      handle: (match) => handleGetAdminTeam(decodeURIComponent(match[1])),
    },
  ];

  return {
    async request<TResponse>(path: string, config: ApiRequestConfig = {}): Promise<TResponse> {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      if (config.signal?.aborted) {
        throw new ApiClientError({
          message: 'Request aborted.',
          status: null,
          code: 'ABORTED',
        });
      }

      const method = config.method ?? 'GET';
      const [cleanPath, queryString] = path.split('?');
      const queryParams: Record<string, string> = {};
      if (queryString) {
        const sp = new URLSearchParams(queryString);
        sp.forEach((value, key) => {
          queryParams[key] = value;
        });
      }

      const effectiveConfig = {
        ...config,
        params: {
          ...queryParams,
          ...((config as { params?: Record<string, string> }).params ?? {}),
        },
      };

      const handler =
        routes[`${method} ${path}`] ??
        routes[`${method} ${cleanPath}`] ??
        ctfStageRoute(method, cleanPath, effectiveConfig);
      if (!handler) {
        for (const route of patternRoutes) {
          const match = route.method === method ? cleanPath.match(route.pattern) : null;
          if (match) {
            return route.handle(match) as TResponse;
          }
        }
        throw new ApiClientError({
          message: `No mock defined for ${method} ${path}.`,
          status: 404,
          code: 'NOT_FOUND',
        });
      }

      return handler(effectiveConfig) as TResponse;
    },
  };
}
