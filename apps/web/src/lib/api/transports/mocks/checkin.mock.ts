import type { BadgeSummary, CheckInResponse } from 'api-contracts';
import { ApiClientError } from '../../errors';
import { devMockState } from './dev-state';

export function handleScanCheckIn(token: string): CheckInResponse {
  if (!token || token.trim().length === 0) {
    throw new ApiClientError({
      message: 'Token is required.',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  // Simulated revoked badge
  if (token === 'REVOKED_TOKEN' || token.includes('REVOKED')) {
    throw new ApiClientError({
      message: 'This badge has been revoked and cannot be used for entrance.',
      status: 403,
      code: 'FORBIDDEN',
    });
  }

  // Simulated invalid token
  if (token === 'INVALID' || token.length < 10) {
    throw new ApiClientError({
      message: 'Badge token was not found or has expired.',
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  // Check if scanning the primary mock badge
  if (token === devMockState.badge.qrToken) {
    const leaderBadge = devMockState.badges.find(
      (b) => b.participantName === devMockState.badge.participantName,
    );

    if (leaderBadge?.checkedInAt) {
      throw new ApiClientError({
        message: 'Participant has already checked in.',
        status: 409,
        code: 'CONFLICT',
      });
    }

    const now = new Date().toISOString();
    if (leaderBadge) {
      leaderBadge.checkedInAt = now;
    }
    devMockState.team.isCheckedIn = true;

    // Record audit entry
    devMockState.auditLog.unshift({
      id: '55555555-5555-4555-8555-555555555555',
      action: 'checkin.scan',
      actorName: devMockState.currentUser?.name ?? 'Mock Organizer Admin',
      createdAt: now,
    });

    return {
      participant: {
        id: '00000000-0000-4000-8000-000000000001',
        name: devMockState.badge.participantName,
      },
      team: {
        id: '00000000-0000-4000-8000-000000000010',
        name: devMockState.badge.teamName,
      },
      checkedInAt: now,
    };
  }

  // Check if scanning any pending badge in roster
  const pendingBadge = devMockState.badges.find((b) => !b.checkedInAt && !b.revokedAt);
  if (pendingBadge) {
    const now = new Date().toISOString();
    pendingBadge.checkedInAt = now;

    devMockState.auditLog.unshift({
      id: '66666666-6666-4666-8666-666666666666',
      action: 'checkin.scan',
      actorName: devMockState.currentUser?.name ?? 'Mock Organizer Admin',
      createdAt: now,
    });

    return {
      participant: {
        id: pendingBadge.participantId,
        name: pendingBadge.participantName,
      },
      team: {
        id: '00000000-0000-4000-8000-000000000010',
        name: pendingBadge.teamName,
      },
      checkedInAt: now,
    };
  }

  // Generic successful check-in response for demo/test tokens
  const now = new Date().toISOString();
  devMockState.auditLog.unshift({
    id: '77777777-7777-4777-8777-777777777777',
    action: 'checkin.scan',
    actorName: devMockState.currentUser?.name ?? 'Mock Organizer Admin',
    createdAt: now,
  });

  return {
    participant: {
      id: '00000000-0000-4000-8000-000000000099',
      name: 'Verified Participant',
    },
    team: {
      id: '00000000-0000-4000-8000-000000000099',
      name: 'Accelerate Tech',
    },
    checkedInAt: now,
  };
}

export function handleRevokeBadge(participantId: string): {
  participantId: string;
  revokedAt: string;
} {
  const badge = devMockState.badges.find((b) => b.participantId === participantId);
  const now = new Date().toISOString();
  if (badge) {
    badge.revokedAt = now;
  }

  devMockState.auditLog.unshift({
    id: '88888888-8888-4888-8888-888888888888',
    action: 'checkin.badge_revoked',
    actorName: devMockState.currentUser?.name ?? 'Mock Organizer Admin',
    createdAt: now,
  });

  return { participantId, revokedAt: now };
}

export function handleGetBadges(): { items: BadgeSummary[]; total: number } {
  return { items: [...devMockState.badges], total: devMockState.badges.length };
}
