import {
  submissionItemSchema,
  submissionsOverviewResponseSchema,
  type CreateSubmissionRequest,
  type SubmissionItem,
  type SubmissionsOverviewResponse,
} from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

/**
 * Team submissions client.
 *
 * The server decides whether a team may submit (phase, Mini-CTF unlock,
 * deadline) and validates the links; the client only renders the overview and
 * posts links. Challenge 01 = one Google Drive link, Challenge 02 = a GitHub
 * repository plus a presentation link.
 */
export interface SubmissionsApi {
  getOverview: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<SubmissionsOverviewResponse>;
  create: (
    payload: CreateSubmissionRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<SubmissionItem>;
}

export function createSubmissionsApi(transport: ApiTransport): SubmissionsApi {
  return {
    async getOverview(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.SUBMISSIONS, {
        signal: config?.signal,
      });
      const parsed = submissionsOverviewResponseSchema.safeParse(data);

      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Submissions overview did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }

      return parsed.data;
    },

    async create(payload, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.SUBMISSIONS, {
        method: 'POST',
        body: payload,
        signal: config?.signal,
      });
      const parsed = submissionItemSchema.safeParse(data);

      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Submission response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }

      return parsed.data;
    },
  };
}
