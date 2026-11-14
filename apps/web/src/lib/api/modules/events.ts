import type { EventPhase } from 'api-contracts';
import { eventStateResponseSchema, type EventStateResponse } from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface EventsApi {
  getEventState: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<EventStateResponse>;
  updatePhase: (
    phase: EventPhase,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<EventStateResponse>;
}

export function createEventsApi(transport: ApiTransport): EventsApi {
  return {
    async getEventState(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.EVENT_STATE, {
        signal: config?.signal,
      });
      const parsed = eventStateResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Event state response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async updatePhase(phase, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.EVENT_STATE, {
        method: 'POST',
        body: { phase },
        signal: config?.signal,
      });
      const parsed = eventStateResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Event state response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
