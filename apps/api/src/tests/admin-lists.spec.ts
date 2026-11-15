import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { registerTeamWithBadges } from '../modules/registration/registration.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Database-backed integration tests for the admin listing endpoints
 * (`GET /api/admin/teams`, `GET /api/admin/jury`) and the badge roster
 * (`GET /api/checkin/badges`) — including a regression test for the Prisma
 * query that previously made the roster fail on every call.
 *
 * Runs against the isolated test database (TEST_DATABASE_URL); skips entirely
 * when no test database is provided so the default suite stays DB-free.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const LEADER_PASSWORD = 'leader-password-2026';

interface FixtureUser {
  id: string;
  email: string;
  name: string;
  role: 'team' | 'jury' | 'admin';
}

describeDb('admin listings and badge roster', () => {
  let app: Express;
  let admin: FixtureUser;
  let jury: FixtureUser;

  beforeAll(async () => {
    await initIntegrationDatabase();
    app = createApp();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();

    const passwordHash = await hashPassword(LEADER_PASSWORD);

    admin = {
      ...(await createUser({
        role: 'admin',
        name: 'Admin Operator',
        email: 'admin@test.local',
        passwordHash,
      })),
      email: 'admin@test.local',
      name: 'Admin Operator',
      role: 'admin',
    } as FixtureUser;

    jury = {
      ...(await createUser({
        role: 'jury',
        name: 'Jury Member',
        email: 'jury@test.local',
        passwordHash,
      })),
      email: 'jury@test.local',
      name: 'Jury Member',
      role: 'jury',
    } as FixtureUser;
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  async function tokenFor(user: FixtureUser): Promise<string> {
    const issued = await createSessionForUser(user.id);
    return issued.token;
  }

  describe('GET /api/checkin/badges', () => {
    it('returns the badge roster for a registered team (regression: query previously failed on every call)', async () => {
      await registerTeamWithBadges({
        teamName: 'Roster Team',
        leader: {
          name: 'Roster Leader',
          email: 'roster-leader@test.local',
          password: LEADER_PASSWORD,
        },
        members: [
          { name: 'Roster Member', email: 'roster-member@admin-lists.test' },
          { name: 'Roster Member Two', email: 'roster-member-two@admin-lists.test' },
          { name: 'Roster Member Three', email: 'roster-member-three@admin-lists.test' },
        ],
      });

      const response = await request(app)
        .get('/api/checkin/badges')
        .set('Authorization', `Bearer ${await tokenFor(admin)}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(4);
      expect(response.body.total).toBe(4);

      const leaderEntry = response.body.items.find(
        (badge: { participantName: string }) => badge.participantName === 'Roster Leader',
      );
      expect(leaderEntry).toMatchObject({
        participantName: 'Roster Leader',
        teamName: 'Roster Team',
      });
      expect(leaderEntry.token).toBeUndefined();
      expect(leaderEntry.checkedInAt).toBeUndefined();
      expect(leaderEntry.revokedAt).toBeUndefined();
    });

    it('requires authentication and the admin role', async () => {
      const unauthenticated = await request(app).get('/api/checkin/badges');
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.body.error.code).toBe('UNAUTHORIZED');

      const asJury = await request(app)
        .get('/api/checkin/badges')
        .set('Authorization', `Bearer ${await tokenFor(jury)}`);
      expect(asJury.status).toBe(403);
      expect(asJury.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/admin/teams', () => {
    it('returns the full team roster with participants and check-in state', async () => {
      const registered = await registerTeamWithBadges({
        teamName: 'Admin Roster Team',
        leader: {
          name: 'Admin Leader',
          email: 'admin-leader@test.local',
          password: LEADER_PASSWORD,
        },
        members: [
          { name: 'Admin Member', email: 'admin-member@admin-lists.test' },
          { name: 'Admin Member Two', email: 'admin-member-two@admin-lists.test' },
          { name: 'Admin Member Three', email: 'admin-member-three@admin-lists.test' },
        ],
      });

      const response = await request(app)
        .get('/api/admin/teams')
        .set('Authorization', `Bearer ${await tokenFor(admin)}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items).toHaveLength(1);

      const team = response.body.items[0];
      expect(team).toMatchObject({
        id: registered.id,
        name: 'Admin Roster Team',
        progressState: 'registered',
        leader: { id: registered.leader.id, name: 'Admin Leader' },
      });
      expect(team.participants).toHaveLength(4);
      expect(team.participants[0]).toMatchObject({ name: 'Admin Leader', isLeader: true });
      expect(team.participants[0].checkedInAt).toBeUndefined();
    });

    it('requires authentication and the admin role', async () => {
      const unauthenticated = await request(app).get('/api/admin/teams');
      expect(unauthenticated.status).toBe(401);

      const asJury = await request(app)
        .get('/api/admin/teams')
        .set('Authorization', `Bearer ${await tokenFor(jury)}`);
      expect(asJury.status).toBe(403);
      expect(asJury.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/admin/jury', () => {
    it('lists jury accounts without exposing credentials', async () => {
      const response = await request(app)
        .get('/api/admin/jury')
        .set('Authorization', `Bearer ${await tokenFor(admin)}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject({
        name: 'Jury Member',
        email: 'jury@test.local',
      });
      expect(response.body.items[0].passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(LEADER_PASSWORD);
    });

    it('requires authentication and the admin role', async () => {
      const unauthenticated = await request(app).get('/api/admin/jury');
      expect(unauthenticated.status).toBe(401);

      const registered = await registerTeamWithBadges({
        teamName: 'Team Role Team',
        leader: {
          name: 'Team Role Leader',
          email: 'team-role@test.local',
          password: LEADER_PASSWORD,
        },
        members: [
          { name: 'Team Role Member', email: 'team-role-member@admin-lists.test' },
          { name: 'Team Role Member Two', email: 'team-role-member-two@admin-lists.test' },
          { name: 'Team Role Member Three', email: 'team-role-member-three@admin-lists.test' },
        ],
      });

      const asTeam = await request(app)
        .get('/api/admin/jury')
        .set('Authorization', `Bearer ${(await createSessionForUser(registered.leader.id)).token}`);
      expect(asTeam.status).toBe(403);
      expect(asTeam.body.error.code).toBe('FORBIDDEN');
    });
  });
});
