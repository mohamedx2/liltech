import { announcementsResponseSchema, type AnnouncementsResponse } from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface AnnouncementsApi {
  getAnnouncements: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<AnnouncementsResponse>;
}

export function createAnnouncementsApi(transport: ApiTransport): AnnouncementsApi {
  return {
    async getAnnouncements(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.ANNOUNCEMENTS, {
        signal: config?.signal,
      });
      const parsed = announcementsResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Announcements response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
