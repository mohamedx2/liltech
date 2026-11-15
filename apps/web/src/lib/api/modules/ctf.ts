import {
  ctfHintResponseSchema,
  ctfStageResponseSchema,
  ctfSubmitResponseSchema,
  type CtfHintResponse,
  type CtfStageResponse,
  type CtfSubmitRequest,
  type CtfSubmitResponse,
} from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

/**
 * Mini-CTF gate client (`/ctf/stage`, `/ctf/stage/hints`, `/ctf/stage/submit`).
 *
 * The server owns every rule here: whether the gate is open, whether an answer
 * is correct, how many hints are revealed, and how often a team may submit.
 * The client only renders what it is given.
 */
export interface CtfApi {
  getStage: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<CtfStageResponse>;
  revealHint: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<CtfHintResponse>;
  submitAnswer: (
    payload: CtfSubmitRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<CtfSubmitResponse>;
}

export function createCtfApi(transport: ApiTransport): CtfApi {
  return {
    async getStage(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CTF_STAGE, {
        signal: config?.signal,
      });
      const parsed = ctfStageResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Mini-CTF stage response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async revealHint(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CTF_HINT, {
        method: 'POST',
        body: {},
        signal: config?.signal,
      });
      const parsed = ctfHintResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Mini-CTF hint response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async submitAnswer(payload, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CTF_SUBMIT, {
        method: 'POST',
        body: payload,
        signal: config?.signal,
      });
      const parsed = ctfSubmitResponseSchema.safeParse(data);
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
