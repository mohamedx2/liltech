import { z } from 'zod';
import {
  adminJuryListResponseSchema,
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
  };
}
