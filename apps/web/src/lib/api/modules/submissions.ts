import {
  submissionHistoryResponseSchema,
  submissionItemSchema,
  type SubmissionHistoryResponse,
  type SubmissionItem,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface SubmissionsApi {
  getMyTeamSubmissions: (
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<SubmissionHistoryResponse>;
  /**
   * Creates a submission. `form` carries the deliverable file and metadata and
   * is sent as `multipart/form-data` by the real transport.
   */
  createSubmission: (
    form: FormData,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<SubmissionItem>;
}

export function createSubmissionsApi(transport: ApiTransport): SubmissionsApi {
  return {
    async getMyTeamSubmissions(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.SUBMISSIONS_MY_TEAM, {
        signal: config?.signal,
      });
      const parsed = submissionHistoryResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Submission history response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async createSubmission(form, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.SUBMISSIONS, {
        method: 'POST',
        body: form,
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
