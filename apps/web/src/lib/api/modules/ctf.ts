import {
  ctfChainResponseSchema,
  ctfHintResponseSchema,
  ctfStageResponseSchema,
  ctfSubmitResponseSchema,
  type CtfChainResponse,
  type CtfHintResponse,
  type CtfStageResponse,
  type CtfSubmitRequest,
  type CtfSubmitResponse,
} from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

/**
 * LOUAGE 404 client.
 *
 * Sequential eligibility, correctness, hint counts and the main-challenge
 * unlock are decided by the server. The client renders `/ctf/chain` and sends
 * a stage slug plus an answer — it never decides what a team may access.
 */
export interface CtfApi {
  getChain: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<CtfChainResponse>;
  getStage: (slug: string, config?: Pick<ApiRequestConfig, 'signal'>) => Promise<CtfStageResponse>;
  revealHint: (slug: string, config?: Pick<ApiRequestConfig, 'signal'>) => Promise<CtfHintResponse>;
  submitAnswer: (
    slug: string,
    payload: CtfSubmitRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<CtfSubmitResponse>;
}

function invalidResponse(message: string, issues: unknown): ApiClientError {
  return new ApiClientError({
    message,
    status: null,
    code: 'INVALID_RESPONSE',
    details: issues,
  });
}

export function createCtfApi(transport: ApiTransport): CtfApi {
  const stagePath = (slug: string, suffix = '') =>
    `${PLANNED_ENDPOINTS.CTF_STAGES}/${encodeURIComponent(slug)}${suffix}`;

  return {
    async getChain(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CTF_CHAIN, {
        signal: config?.signal,
      });
      const parsed = ctfChainResponseSchema.safeParse(data);

      if (!parsed.success) {
        throw invalidResponse(
          'Mini-CTF chain response did not match the contract.',
          parsed.error.issues,
        );
      }

      return parsed.data;
    },

    async getStage(slug, config) {
      const data = await transport.request<unknown>(stagePath(slug), { signal: config?.signal });
      const parsed = ctfStageResponseSchema.safeParse(data);

      if (!parsed.success) {
        throw invalidResponse(
          'Mini-CTF stage response did not match the contract.',
          parsed.error.issues,
        );
      }

      return parsed.data;
    },

    async revealHint(slug, config) {
      const data = await transport.request<unknown>(stagePath(slug, '/hints'), {
        method: 'POST',
        body: {},
        signal: config?.signal,
      });
      const parsed = ctfHintResponseSchema.safeParse(data);

      if (!parsed.success) {
        throw invalidResponse(
          'Mini-CTF hint response did not match the contract.',
          parsed.error.issues,
        );
      }

      return parsed.data;
    },

    async submitAnswer(slug, payload, config) {
      const data = await transport.request<unknown>(stagePath(slug, '/submit'), {
        method: 'POST',
        body: payload,
        signal: config?.signal,
      });
      const parsed = ctfSubmitResponseSchema.safeParse(data);

      if (!parsed.success) {
        throw invalidResponse(
          'Mini-CTF submission response did not match the contract.',
          parsed.error.issues,
        );
      }

      return parsed.data;
    },
  };
}
