import { z } from 'zod';
import { auditLogEntrySchema, type AuditLogEntry } from 'api-contracts';
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
  };
}
