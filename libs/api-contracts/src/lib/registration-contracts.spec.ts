import { describe, expect, it } from 'vitest';
import {
  TEAM_MEMBERS_TOTAL_MAX,
  TEAM_MEMBERS_TOTAL_MIN,
  createTeamRequestSchema,
} from './registration-contracts.js';

function teamRequest(members: Array<{ name: string; email?: string }>) {
  return {
    teamName: 'Contract Crew',
    leader: { name: 'Leader', email: 'leader@example.com', password: 'long-enough-password' },
    members,
  };
}

function membersOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Member ${index + 1}`,
    email: `member${index + 1}@example.com`,
  }));
}

describe('createTeamRequestSchema', () => {
  it('accepts teams from the minimum to the maximum size (leader included)', () => {
    expect(TEAM_MEMBERS_TOTAL_MIN).toBe(4);
    expect(TEAM_MEMBERS_TOTAL_MAX).toBe(7);
    expect(createTeamRequestSchema.safeParse(teamRequest(membersOf(3))).success).toBe(true);
    expect(createTeamRequestSchema.safeParse(teamRequest(membersOf(6))).success).toBe(true);
  });

  it('rejects teams below or above the size range', () => {
    expect(createTeamRequestSchema.safeParse(teamRequest(membersOf(2))).success).toBe(false);
    expect(createTeamRequestSchema.safeParse(teamRequest(membersOf(7))).success).toBe(false);
  });

  it('rejects a member email that repeats the leader email, case-insensitively', () => {
    const members = membersOf(3);
    members[1] = { name: 'Copycat', email: 'LEADER@example.com' };

    const result = createTeamRequestSchema.safeParse(teamRequest(members));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['members', 1, 'email']);
  });

  it('rejects two members sharing an email', () => {
    const members = membersOf(3);
    members[2] = { name: 'Twin', email: members[0].email };

    expect(createTeamRequestSchema.safeParse(teamRequest(members)).success).toBe(false);
  });

  it('allows several members without an email', () => {
    const members = [{ name: 'No Mail One' }, { name: 'No Mail Two' }, { name: 'No Mail Three' }];

    expect(createTeamRequestSchema.safeParse(teamRequest(members)).success).toBe(true);
  });
});
