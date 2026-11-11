import {
  miniCtfStatusResponseSchema,
  miniCtfSubmitResponseSchema,
  type MiniCtfStatusResponse,
  type MiniCtfSubmitRequest,
  type MiniCtfSubmitResponse,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface MiniCtfApi {
  getStatus: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<MiniCtfStatusResponse>;
  submitFlag: (
    payload: MiniCtfSubmitRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<MiniCtfSubmitResponse>;
}

export function createMiniCtfApi(transport: ApiTransport): MiniCtfApi {
  return {
    async getStatus(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.MINI_CTF_STATUS, {
        signal: config?.signal,
      });
      const parsed = miniCtfStatusResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Mini-CTF status response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async submitFlag(payload, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.MINI_CTF_SUBMIT, {
        method: 'POST',
        body: payload,
        signal: config?.signal,
      });
      const parsed = miniCtfSubmitResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Mini-CTF submission response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
