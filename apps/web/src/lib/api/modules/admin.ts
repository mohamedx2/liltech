import { z } from 'zod';
import {
  adminChallengeListResponseSchema,
  adminJuryAccountDetailSchema,
  adminJuryListResponseSchema,
  challengeAdminDetailSchema,
  resendBadgeEmailResponseSchema,
  type AdminChallengeListResponse,
  type AdminJuryAccountDetail,
  type ChallengeAdminDetail,
  type CreateChallengeRequest,
  type CreateJuryAccountRequest,
  type ResendBadgeEmailResponse,
  type UpdateChallengeRequest,
  type UpdateJuryAccountRequest,
  adminTeamListResponseSchema,
  auditLogEntrySchema,
  type AdminJuryListResponse,
  type AdminTeamListResponse,
  type AuditLogEntry,
} from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
}

export const auditLogResponseSchema = z.object({
  items: z.array(auditLogEntrySchema),
  total: z.number().int().nonnegative(),
});

export interface AdminApi {
  getAuditLog: (
    params?: { limit?: number; offset?: number },
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<AuditLogResponse>;
  publishAnnouncement: (
    body: string,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<{ id: string; body: string; publishedAt: string; authorName?: string }>;
  getTeams: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<AdminTeamListResponse>;
  getJuryAccounts: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<AdminJuryListResponse>;
  createJuryAccount: (input: CreateJuryAccountRequest) => Promise<AdminJuryAccountDetail>;
  updateJuryAccount: (
    id: string,
    input: UpdateJuryAccountRequest,
  ) => Promise<AdminJuryAccountDetail>;
  deleteJuryAccount: (id: string) => Promise<void>;
  /** Resends one participant's badge email (admins are not rate limited). */
  resendBadgeEmail: (participantId: string) => Promise<ResendBadgeEmailResponse>;
  getChallenges: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<AdminChallengeListResponse>;
  createChallenge: (input: CreateChallengeRequest) => Promise<ChallengeAdminDetail>;
  updateChallenge: (id: string, input: UpdateChallengeRequest) => Promise<ChallengeAdminDetail>;
  /** Server refuses unless the event phase is `live`. */
  startChallenge: (id: string) => Promise<ChallengeAdminDetail>;
  /** Server refuses unless the event phase is `live`. */
  endChallenge: (id: string) => Promise<ChallengeAdminDetail>;
}

function parseOrThrow<T>(
  schema: {
    safeParse: (
      data: unknown,
    ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
  },
  data: unknown,
  what: string,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiClientError({
      message: `${what} response did not match the expected contract.`,
      status: null,
      code: 'INVALID_RESPONSE',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

export function createAdminApi(transport: ApiTransport): AdminApi {
  return {
    async getAuditLog(params, config) {
      const limit = params?.limit ?? 50;
      const offset = params?.offset ?? 0;
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_AUDIT_LOG}?limit=${limit}&offset=${offset}`,
        {
          signal: config?.signal,
        },
      );
      const parsed = auditLogResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Audit log response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async publishAnnouncement(body, config) {
      const data = await transport.request<{
        id: string;
        body: string;
        publishedAt: string;
        authorName?: string;
      }>(PLANNED_ENDPOINTS.ANNOUNCEMENTS, {
        method: 'POST',
        body: { body },
        signal: config?.signal,
      });
      return data;
    },

    async getTeams(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.ADMIN_TEAMS, {
        signal: config?.signal,
      });
      const parsed = adminTeamListResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Team roster response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async getJuryAccounts(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.ADMIN_JURY, {
        signal: config?.signal,
      });
      const parsed = adminJuryListResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Jury account listing did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async createJuryAccount(input) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.ADMIN_JURY, {
        method: 'POST',
        body: input,
      });
      return parseOrThrow(adminJuryAccountDetailSchema, data, 'Jury account');
    },

    async updateJuryAccount(id, input) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_JURY}/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: input },
      );
      return parseOrThrow(adminJuryAccountDetailSchema, data, 'Jury account');
    },

    async deleteJuryAccount(id) {
      await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_JURY}/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
    },

    async resendBadgeEmail(participantId) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_PARTICIPANTS}/${encodeURIComponent(participantId)}/resend-badge-email`,
        { method: 'POST' },
      );
      return parseOrThrow(resendBadgeEmailResponseSchema, data, 'Badge email');
    },

    async getChallenges(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.ADMIN_CHALLENGES, {
        signal: config?.signal,
      });
      return parseOrThrow(adminChallengeListResponseSchema, data, 'Challenge list');
    },

    async createChallenge(input) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.ADMIN_CHALLENGES, {
        method: 'POST',
        body: input,
      });
      return parseOrThrow(challengeAdminDetailSchema, data, 'Challenge');
    },

    async updateChallenge(id, input) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_CHALLENGES}/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: input },
      );
      return parseOrThrow(challengeAdminDetailSchema, data, 'Challenge');
    },

    async startChallenge(id) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_CHALLENGES}/${encodeURIComponent(id)}/start`,
        { method: 'POST' },
      );
      return parseOrThrow(challengeAdminDetailSchema, data, 'Challenge');
    },

    async endChallenge(id) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.ADMIN_CHALLENGES}/${encodeURIComponent(id)}/end`,
        { method: 'POST' },
      );
      return parseOrThrow(challengeAdminDetailSchema, data, 'Challenge');
    },
  };
}
