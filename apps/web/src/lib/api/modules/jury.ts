import { z } from 'zod';
import {
  juryOverviewResponseSchema,
  juryTeamEvaluationResponseSchema,
  juryTeamItemSchema,
  submitEvaluationRequestSchema,
  submitEvaluationResponseSchema,
  type JuryOverviewResponse,
  type JuryTeamEvaluationResponse,
  type JuryTeamItem,
  type SubmitEvaluationRequest,
  type SubmitEvaluationResponse,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface JuryApi {
  getOverview: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<JuryOverviewResponse>;
  getAssignedTeams: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<JuryTeamItem[]>;
  getTeamEvaluation: (
    teamId: string,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<JuryTeamEvaluationResponse>;
  submitEvaluation: (
    teamId: string,
    payload: SubmitEvaluationRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<SubmitEvaluationResponse>;
}

export function createJuryApi(transport: ApiTransport): JuryApi {
  return {
    async getOverview(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.JURY_OVERVIEW, {
        signal: config?.signal,
      });
      const parsed = juryOverviewResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Jury overview response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async getAssignedTeams(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.JURY_TEAMS, {
        signal: config?.signal,
      });
      const parsed = z.array(juryTeamItemSchema).safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Jury assigned teams response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async getTeamEvaluation(teamId, config) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.JURY_EVALUATION}?teamId=${encodeURIComponent(teamId)}`,
        {
          signal: config?.signal,
        },
      );
      const parsed = juryTeamEvaluationResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Team evaluation response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async submitEvaluation(teamId, payload, config) {
      const validated = submitEvaluationRequestSchema.parse(payload);
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.JURY_EVALUATION}?teamId=${encodeURIComponent(teamId)}`,
        {
          method: 'POST',
          body: validated,
          signal: config?.signal,
        },
      );
      const parsed = submitEvaluationResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Submit evaluation response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
