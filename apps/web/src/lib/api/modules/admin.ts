import { z } from 'zod';
import {
  adminChallengeListResponseSchema,
  adminJuryAccountDetailSchema,
  adminJuryListResponseSchema,
  adminOverviewResponseSchema,
  adminTeamListResponseSchema,
  adminTeamSchema,
  announcementSchema,
  auditLogEntrySchema,
  bulkResendBadgeEmailsResponseSchema,
  challengeAdminDetailSchema,
  reissueBadgeResponseSchema,
  resendBadgeEmailResponseSchema,
  resetTeamPasswordResponseSchema,
  sendBadgeEmailsResponseSchema,
  type AddParticipantRequest,
  type AdminChallengeListResponse,
  type AdminJuryAccountDetail,
  type AdminJuryListResponse,
  type AdminOverviewResponse,
  type AdminTeam,
  type AdminTeamListResponse,
  type Announcement,
  type AuditLogEntry,
  type BulkResendBadgeEmailsResponse,
  type ChallengeAdminDetail,
  type CreateChallengeRequest,
  type CreateJuryAccountRequest,
  type ReissueBadgeResponse,
  type RenameTeamRequest,
  type ResendBadgeEmailResponse,
  type ResetTeamPasswordResponse,
  type SendBadgeEmailsRequest,
  type SendBadgeEmailsResponse,
  type SetTeamStatusRequest,
  type UpdateChallengeRequest,
  type UpdateJuryAccountRequest,
  type UpdateParticipantRequest,
} from 'api-contracts';
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

const announcementListSchema = z.object({
  items: z.array(announcementSchema),
  total: z.number().int().nonnegative(),
});

type Signal = Pick<ApiRequestConfig, 'signal'>;

/**
 * Admin client: situation board, team/participant operations, challenges,
 * jury accounts, announcements and the audit trail. Every response is
 * validated against its contract; every write is audited server-side.
 */
export interface AdminApi {
  getOverview: (config?: Signal) => Promise<AdminOverviewResponse>;
  getAuditLog: (
    params?: { limit?: number; offset?: number; action?: string },
    config?: Signal,
  ) => Promise<AuditLogResponse>;

  // Announcements
  publishAnnouncement: (body: string, config?: Signal) => Promise<Announcement>;
  getAnnouncements: (config?: Signal) => Promise<{ items: Announcement[]; total: number }>;
  deleteAnnouncement: (announcementId: string) => Promise<void>;

  // Teams
  getTeams: (config?: Signal) => Promise<AdminTeamListResponse>;
  getTeam: (teamId: string, config?: Signal) => Promise<AdminTeam>;
  renameTeam: (teamId: string, body: RenameTeamRequest) => Promise<AdminTeam>;
  setTeamStatus: (teamId: string, body: SetTeamStatusRequest) => Promise<AdminTeam>;
  resetTeamPassword: (teamId: string) => Promise<ResetTeamPasswordResponse>;
  deleteTeam: (teamId: string) => Promise<void>;
  grantCtfSolve: (teamId: string, challengeId: string) => Promise<AdminTeam>;
  revokeCtfSolve: (teamId: string, challengeId: string) => Promise<AdminTeam>;

  // Participants
  addParticipant: (teamId: string, body: AddParticipantRequest) => Promise<AdminTeam>;
  updateParticipant: (participantId: string, body: UpdateParticipantRequest) => Promise<AdminTeam>;
  removeParticipant: (participantId: string) => Promise<AdminTeam>;
  checkInParticipant: (participantId: string) => Promise<AdminTeam>;
  undoCheckIn: (participantId: string) => Promise<AdminTeam>;
  reissueBadge: (participantId: string) => Promise<ReissueBadgeResponse>;
  resendBadgeEmail: (participantId: string) => Promise<ResendBadgeEmailResponse>;
  revokeBadge: (participantId: string) => Promise<void>;
  resendFailedBadgeEmails: () => Promise<BulkResendBadgeEmailsResponse>;
  sendBadgeEmails: (opts: SendBadgeEmailsRequest) => Promise<SendBadgeEmailsResponse>;

  // Challenges
  getChallenges: (config?: Signal) => Promise<AdminChallengeListResponse>;
  createChallenge: (body: CreateChallengeRequest) => Promise<ChallengeAdminDetail>;
  updateChallenge: (
    challengeId: string,
    body: UpdateChallengeRequest,
  ) => Promise<ChallengeAdminDetail>;
  startChallenge: (challengeId: string) => Promise<ChallengeAdminDetail>;
  endChallenge: (challengeId: string) => Promise<ChallengeAdminDetail>;

  // Jury
  getJuryAccounts: (config?: Signal) => Promise<AdminJuryListResponse>;
  createJuryAccount: (body: CreateJuryAccountRequest) => Promise<AdminJuryAccountDetail>;
  updateJuryAccount: (
    juryId: string,
    body: UpdateJuryAccountRequest,
  ) => Promise<AdminJuryAccountDetail>;
  deleteJuryAccount: (juryId: string) => Promise<void>;
}

function parseWith<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  label: string,
): z.infer<Schema> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiClientError({
      message: `${label} did not match the expected contract.`,
      status: null,
      code: 'INVALID_RESPONSE',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

const enc = encodeURIComponent;

export function createAdminApi(transport: ApiTransport): AdminApi {
  const get = async <Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    label: string,
    config?: Signal,
  ) => parseWith(schema, await transport.request<unknown>(path, { signal: config?.signal }), label);

  const send = async <Schema extends z.ZodType>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    schema: Schema,
    label: string,
    body?: unknown,
  ) => parseWith(schema, await transport.request<unknown>(path, { method, body }), label);

  const sendNoContent = async (method: 'POST' | 'DELETE', path: string) => {
    await transport.request<unknown>(path, { method });
  };

  const teamPath = (teamId: string) => `${PLANNED_ENDPOINTS.ADMIN_TEAMS}/${enc(teamId)}`;
  const participantPath = (participantId: string) =>
    `${PLANNED_ENDPOINTS.ADMIN_PARTICIPANTS}/${enc(participantId)}`;
  const challengePath = (challengeId: string) =>
    `${PLANNED_ENDPOINTS.ADMIN_CHALLENGES}/${enc(challengeId)}`;
  const juryPath = (juryId: string) => `${PLANNED_ENDPOINTS.ADMIN_JURY}/${enc(juryId)}`;

  return {
    getOverview: (config) =>
      get(PLANNED_ENDPOINTS.ADMIN_OVERVIEW, adminOverviewResponseSchema, 'Overview', config),

    getAuditLog(params, config) {
      const query = new URLSearchParams({
        limit: String(params?.limit ?? 50),
        offset: String(params?.offset ?? 0),
        ...(params?.action ? { action: params.action } : {}),
      });
      return get(
        `${PLANNED_ENDPOINTS.ADMIN_AUDIT_LOG}?${query.toString()}`,
        auditLogResponseSchema,
        'Audit log',
        config,
      );
    },

    publishAnnouncement: (body) =>
      send('POST', PLANNED_ENDPOINTS.ANNOUNCEMENTS, announcementSchema, 'Announcement', { body }),
    getAnnouncements: (config) =>
      get(PLANNED_ENDPOINTS.ANNOUNCEMENTS, announcementListSchema, 'Announcements', config),
    deleteAnnouncement: (announcementId) =>
      sendNoContent('DELETE', `${PLANNED_ENDPOINTS.ANNOUNCEMENTS}/${enc(announcementId)}`),

    getTeams: (config) =>
      get(PLANNED_ENDPOINTS.ADMIN_TEAMS, adminTeamListResponseSchema, 'Team roster', config),
    getTeam: (teamId, config) => get(teamPath(teamId), adminTeamSchema, 'Team', config),
    renameTeam: (teamId, body) => send('PATCH', teamPath(teamId), adminTeamSchema, 'Team', body),
    setTeamStatus: (teamId, body) =>
      send('POST', `${teamPath(teamId)}/status`, adminTeamSchema, 'Team', body),
    resetTeamPassword: (teamId) =>
      send(
        'POST',
        `${teamPath(teamId)}/reset-password`,
        resetTeamPasswordResponseSchema,
        'Password reset',
      ),
    deleteTeam: (teamId) => sendNoContent('DELETE', teamPath(teamId)),
    grantCtfSolve: (teamId, challengeId) =>
      send('POST', `${teamPath(teamId)}/ctf-solves`, adminTeamSchema, 'Team', { challengeId }),
    revokeCtfSolve: (teamId, challengeId) =>
      send('DELETE', `${teamPath(teamId)}/ctf-solves/${enc(challengeId)}`, adminTeamSchema, 'Team'),

    addParticipant: (teamId, body) =>
      send('POST', `${teamPath(teamId)}/participants`, adminTeamSchema, 'Team', body),
    updateParticipant: (participantId, body) =>
      send('PATCH', participantPath(participantId), adminTeamSchema, 'Team', body),
    removeParticipant: (participantId) =>
      send('DELETE', participantPath(participantId), adminTeamSchema, 'Team'),
    checkInParticipant: (participantId) =>
      send('POST', `${participantPath(participantId)}/check-in`, adminTeamSchema, 'Team'),
    undoCheckIn: (participantId) =>
      send('DELETE', `${participantPath(participantId)}/check-in`, adminTeamSchema, 'Team'),
    reissueBadge: (participantId) =>
      send(
        'POST',
        `${participantPath(participantId)}/reissue-badge`,
        reissueBadgeResponseSchema,
        'Badge reissue',
      ),
    resendBadgeEmail: (participantId) =>
      send(
        'POST',
        `${participantPath(participantId)}/resend-badge-email`,
        resendBadgeEmailResponseSchema,
        'Badge email',
      ),
    async revokeBadge(participantId) {
      await transport.request<unknown>(PLANNED_ENDPOINTS.CHECKIN_REVOKE, {
        method: 'POST',
        body: { participantId },
      });
    },
    resendFailedBadgeEmails: () =>
      send(
        'POST',
        PLANNED_ENDPOINTS.ADMIN_BADGES_RESEND_FAILED,
        bulkResendBadgeEmailsResponseSchema,
        'Bulk resend',
      ),
    sendBadgeEmails: (opts) =>
      send(
        'POST',
        PLANNED_ENDPOINTS.ADMIN_BADGES_SEND_ALL,
        sendBadgeEmailsResponseSchema,
        'Send all badge emails',
        opts,
      ),

    getChallenges: (config) =>
      get(
        PLANNED_ENDPOINTS.ADMIN_CHALLENGES,
        adminChallengeListResponseSchema,
        'Challenges',
        config,
      ),
    createChallenge: (body) =>
      send(
        'POST',
        PLANNED_ENDPOINTS.ADMIN_CHALLENGES,
        challengeAdminDetailSchema,
        'Challenge',
        body,
      ),
    updateChallenge: (challengeId, body) =>
      send('PATCH', challengePath(challengeId), challengeAdminDetailSchema, 'Challenge', body),
    startChallenge: (challengeId) =>
      send('POST', `${challengePath(challengeId)}/start`, challengeAdminDetailSchema, 'Challenge'),
    endChallenge: (challengeId) =>
      send('POST', `${challengePath(challengeId)}/end`, challengeAdminDetailSchema, 'Challenge'),

    getJuryAccounts: (config) =>
      get(PLANNED_ENDPOINTS.ADMIN_JURY, adminJuryListResponseSchema, 'Jury accounts', config),
    createJuryAccount: (body) =>
      send(
        'POST',
        PLANNED_ENDPOINTS.ADMIN_JURY,
        adminJuryAccountDetailSchema,
        'Jury account',
        body,
      ),
    updateJuryAccount: (juryId, body) =>
      send('PATCH', juryPath(juryId), adminJuryAccountDetailSchema, 'Jury account', body),
    deleteJuryAccount: (juryId) => sendNoContent('DELETE', juryPath(juryId)),
  };
}
