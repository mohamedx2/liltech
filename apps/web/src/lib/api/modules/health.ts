import { healthResponseSchema, type HealthResponse } from 'api-contracts';
import { IMPLEMENTED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface HealthApi {
  getHealth: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<HealthResponse>;
}

export function createHealthApi(transport: ApiTransport): HealthApi {
  return {
    async getHealth(config) {
      const data = await transport.request<unknown>(IMPLEMENTED_ENDPOINTS.HEALTH, {
        signal: config?.signal,
      });
      const parsed = healthResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Health response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
