import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, login, createUser } from '../modules/auth/auth.service';
import { registerTeamWithBadges } from '../modules/registration/registration.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Database-backed integration tests for the foundation modules:
 * auth/RBAC, event phase state, registration, QR check-in, announcements,
 * and the admin audit log.
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

interface CreatedTeam {
  teamId: string;
  leaderEmail: string;
  tokens: string[];
  leaderParticipantId: string;
}

describeDb('api foundation modules', () => {
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

  async function registerTeam(name: string, leaderEmail: string): Promise<CreatedTeam> {
    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: name,
        leader: { name: 'Team Leader', email: leaderEmail, password: LEADER_PASSWORD },
        members: [{ name: 'Member One' }, { name: 'Member Two' }],
      });

    expect(response.status).toBe(201);

    const participants = response.body.participants as Array<{ id: string; isLeader: boolean }>;
    const leaderParticipant = participants.find((p) => p.isLeader);

    expect(leaderParticipant).toBeDefined();
    expect(leaderParticipant?.id).toBeDefined();

    return {
      teamId: response.body.id as string,
      leaderEmail,
      tokens: (response.body.badges as Array<{ token: string }>).map((b) => b.token),
      leaderParticipantId: leaderParticipant!.id,
    };
  }

  async function tokenFor(user: FixtureUser): Promise<string> {
    const issued = await createSessionForUser(user.id);
    return issued.token;
  }

  describe('authentication and RBAC', () => {
    it('logs in with valid credentials and returns a bearer session', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: admin.email, password: LEADER_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.account).toMatchObject({ role: 'admin', email: admin.email });
      expect(response.body.token.length).toBeGreaterThanOrEqual(32);
      expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects wrong password and unknown email with the same error', async () => {
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: admin.email, password: 'not-the-password-123' });
      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe('UNAUTHORIZED');

      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'whatever-password-1' });
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects malformed login payloads', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('me requires authentication', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('logout revokes the presented token', async () => {
      const token = await tokenFor(admin);

      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(200);

      const logout = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(logout.status).toBe(204);

      const afterLogout = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(afterLogout.status).toBe(401);
    });

    it('a jury account cannot use admin endpoints and vice versa', async () => {
      const juryToken = await tokenFor(jury);

      const juryOnAdmin = await request(app)
        .post('/api/event-state')
        .set('Authorization', `Bearer ${juryToken}`)
        .send({ phase: 'live' });
      expect(juryOnAdmin.status).toBe(403);
      expect(juryOnAdmin.body.error.code).toBe('FORBIDDEN');

      const teamMember: FixtureUser = {
        ...(await createUser({
          role: 'team',
          name: 'Plain Team',
          email: 'plain-team@test.local',
          passwordHash: await hashPassword(LEADER_PASSWORD),
        })),
        email: 'plain-team@test.local',
        name: 'Plain Team',
        role: 'team',
      } as FixtureUser;
      const teamToken = await tokenFor(teamMember);

      const teamOnCheckin = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${teamToken}`)
        .send({ token: 'A'.repeat(43) });
      expect(teamOnCheckin.status).toBe(403);
    });

    it('team members see their own team only via the me endpoint', async () => {
      await registerTeam('Team Me Endpoint', 'me-endpoint-leader@test.local');

      const logged = await login('me-endpoint-leader@test.local', LEADER_PASSWORD);
      const me = await request(app)
        .get('/api/registration/teams/me')
        .set('Authorization', `Bearer ${logged.token}`);

      expect(me.status).toBe(200);
      expect(me.body.name).toBe('Team Me Endpoint');
      expect(me.body.participants).toHaveLength(3);
      expect(me.body.participants.filter((p: { isLeader: boolean }) => p.isLeader)).toHaveLength(1);
    });

    it('jury accounts are refused on the team me endpoint', async () => {
      const juryToken = await tokenFor(jury);
      const response = await request(app)
        .get('/api/registration/teams/me')
        .set('Authorization', `Bearer ${juryToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('event phase state', () => {
    it('starts in registration and exposes server time publicly', async () => {
      const response = await request(app).get('/api/event-state');

      expect(response.status).toBe(200);
      expect(response.body.phase).toBe('registration');
      expect(new Date(response.body.serverTime).toString()).not.toBe('Invalid Date');
    });

    it('admin can transition the phase and the change is audited', async () => {
      const token = await tokenFor(admin);

      const before = await request(app).get('/api/event-state');
      const changed = await request(app)
        .post('/api/event-state')
        .set('Authorization', `Bearer ${token}`)
        .send({ phase: 'checkin' });

      expect(changed.status).toBe(200);
      expect(changed.body.phase).toBe('checkin');
      expect(changed.body.phaseChangedAt >= before.body.phaseChangedAt).toBe(true);
      expect(changed.body.serverTime).toBeDefined();

      const audit = await request(app)
        .get('/api/admin/audit-log')
        .set('Authorization', `Bearer ${token}`);

      expect(audit.status).toBe(200);
      expect(
        audit.body.items.some((item: { action: string }) => item.action === 'event.phase_changed'),
      ).toBe(true);
    });

    it('rejects transitioning to the current phase', async () => {
      const token = await tokenFor(admin);

      const response = await request(app)
        .post('/api/event-state')
        .set('Authorization', `Bearer ${token}`)
        .send({ phase: 'registration' });

      expect(response.status).toBe(400);
    });

    it('requires authentication for transitions', async () => {
      const response = await request(app).post('/api/event-state').send({ phase: 'live' });

      expect(response.status).toBe(401);
    });
  });

  describe('registration', () => {
    it('registers a 3–5 member team and issues one badge per participant', async () => {
      const created = await registerTeam('Hackers United', 'hackers-leader@test.local');

      expect(created.tokens).toHaveLength(3);

      const response = await request(app)
        .post('/api/registration/teams')
        .send({
          teamName: 'Invalid Size',
          leader: {
            name: 'Leader',
            email: 'invalid-size-leader@test.local',
            password: LEADER_PASSWORD,
          },
          members: [{ name: 'Only One' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('registers a full 5-member team and issues one badge per participant', async () => {
      const response = await request(app)
        .post('/api/registration/teams')
        .send({
          teamName: 'Full House',
          leader: {
            name: 'Full Leader',
            email: 'full-house-leader@test.local',
            password: LEADER_PASSWORD,
          },
          members: [
            { name: 'Member One' },
            { name: 'Member Two' },
            { name: 'Member Three' },
            { name: 'Member Four' },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.badges).toHaveLength(5);
    });

    it('enforces the 3–5 member size at the service layer', async () => {
      const tooSmall = {
        teamName: 'Too Small',
        leader: {
          name: 'Small Leader',
          email: 'too-small-leader@test.local',
          password: LEADER_PASSWORD,
        },
        members: [{ name: 'Only Member' }],
      };
      await expect(registerTeamWithBadges(tooSmall)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
      });

      const tooLarge = {
        teamName: 'Too Large',
        leader: {
          name: 'Large Leader',
          email: 'too-large-leader@test.local',
          password: LEADER_PASSWORD,
        },
        members: [
          { name: 'One' },
          { name: 'Two' },
          { name: 'Three' },
          { name: 'Four' },
          { name: 'Five' },
        ],
      };
      await expect(registerTeamWithBadges(tooLarge)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
      });

      // The rejected registrations must not have created leader accounts.
      const loginAttempt = await request(app)
        .post('/api/auth/login')
        .send({ email: 'too-small-leader@test.local', password: LEADER_PASSWORD });
      expect(loginAttempt.status).toBe(401);
    });

    it('rejects duplicate team names and duplicate leader emails', async () => {
      await registerTeam('Duplicate Probe', 'probe-leader@test.local');

      const sameName = await request(app)
        .post('/api/registration/teams')
        .send({
          teamName: 'Duplicate Probe',
          leader: {
            name: 'Other Leader',
            email: 'other-leader@test.local',
            password: LEADER_PASSWORD,
          },
          members: [{ name: 'M1' }, { name: 'M2' }],
        });
      expect(sameName.status).toBe(409);
      expect(sameName.body.error.code).toBe('CONFLICT');

      const sameEmail = await request(app)
        .post('/api/registration/teams')
        .send({
          teamName: 'Different Name',
          leader: {
            name: 'Same Leader',
            email: 'probe-leader@test.local',
            password: LEADER_PASSWORD,
          },
          members: [{ name: 'M1' }, { name: 'M2' }],
        });
      expect(sameEmail.status).toBe(409);
      expect(sameEmail.body.error.code).toBe('CONFLICT');
    });
  });

  describe('QR check-in', () => {
    it('scans a badge exactly once', async () => {
      const created = await registerTeam('Checkin Crew', 'checkin-leader@test.local');
      const token = await tokenFor(admin);

      const first = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: created.tokens[0] });

      expect(first.status).toBe(200);
      expect(first.body.participant.id).toBe(created.leaderParticipantId);
      expect(first.body.team.name).toBe('Checkin Crew');
      expect(new Date(first.body.checkedInAt).toString()).not.toBe('Invalid Date');

      const second = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: created.tokens[0] });

      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('CONFLICT');
    });

    it('refuses unknown and revoked badges', async () => {
      const token = await tokenFor(admin);

      const unknown = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });

      expect(unknown.status).toBe(404);

      const created = await registerTeam('Revoked Crew', 'revoked-leader@test.local');

      const revoked = await request(app)
        .post('/api/checkin/revoke')
        .set('Authorization', `Bearer ${token}`)
        .send({ participantId: created.leaderParticipantId });
      expect(revoked.status).toBe(200);

      const afterRevoke = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: created.tokens[0] });
      expect(afterRevoke.status).toBe(403);
      expect(afterRevoke.body.error.code).toBe('FORBIDDEN');
    });

    it('a successful scan moves the team progress state from registered to checked_in', async () => {
      const created = await registerTeam('Progress Crew', 'progress-leader@test.local');
      const logged = await login('progress-leader@test.local', LEADER_PASSWORD);

      const before = await request(app)
        .get('/api/registration/teams/me')
        .set('Authorization', `Bearer ${logged.token}`);
      expect(before.status).toBe(200);
      expect(before.body.progressState).toBe('registered');

      const adminToken = await tokenFor(admin);
      const scan = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: created.tokens[0] });
      expect(scan.status).toBe(200);

      const after = await request(app)
        .get('/api/registration/teams/me')
        .set('Authorization', `Bearer ${logged.token}`);
      expect(after.status).toBe(200);
      expect(after.body.progressState).toBe('checked_in');
    });

    it('rejects invalid revoke payloads', async () => {
      const created = await registerTeam(
        'Revoke Validation Crew',
        'revoke-validation-leader@test.local',
      );
      const adminToken = await tokenFor(admin);

      const missing = await request(app)
        .post('/api/checkin/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');

      const malformed = await request(app)
        .post('/api/checkin/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ participantId: 'not-a-uuid' });
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

      const unknownField = await request(app)
        .post('/api/checkin/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ participantId: created.leaderParticipantId, token: 'A'.repeat(43) });
      expect(unknownField.status).toBe(400);
      expect(unknownField.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('logs every scan in the audit trail', async () => {
      const created = await registerTeam('Audited Crew', 'audited-leader@test.local');
      const token = await tokenFor(admin);

      await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: created.tokens[0] });

      const audit = await request(app)
        .get('/api/admin/audit-log')
        .set('Authorization', `Bearer ${token}`);

      expect(
        audit.body.items.some((item: { action: string }) => item.action === 'checkin.scan'),
      ).toBe(true);
    });
  });

  describe('announcements and audit log access', () => {
    it('admin publishes; any authenticated role reads', async () => {
      const adminToken = await tokenFor(admin);
      const juryToken = await tokenFor(jury);

      const published = await request(app)
        .post('/api/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Doors open at 18:00.' });

      expect(published.status).toBe(201);
      expect(published.body.body).toBe('Doors open at 18:00.');
      expect(published.body.authorName).toBe('Admin Operator');

      const feed = await request(app)
        .get('/api/announcements')
        .set('Authorization', `Bearer ${juryToken}`);
      expect(feed.status).toBe(200);
      expect(feed.body.items[0].body).toBe('Doors open at 18:00.');

      const teamMember: FixtureUser = {
        ...(await createUser({
          role: 'team',
          name: 'Ann Team',
          email: 'ann-team@test.local',
          passwordHash: await hashPassword(LEADER_PASSWORD),
        })),
        email: 'ann-team@test.local',
        name: 'Ann Team',
        role: 'team',
      } as FixtureUser;

      const teamPost = await request(app)
        .post('/api/announcements')
        .set('Authorization', `Bearer ${await tokenFor(teamMember)}`)
        .send({ body: 'should fail' });
      expect(teamPost.status).toBe(403);
    });

    it('anonymous users cannot read announcements or the audit log', async () => {
      const announcements = await request(app).get('/api/announcements');
      expect(announcements.status).toBe(401);

      const audit = await request(app).get('/api/admin/audit-log');
      expect(audit.status).toBe(401);
    });

    it('audit log is admin-only and paginated', async () => {
      const adminToken = await tokenFor(admin);
      const juryToken = await tokenFor(jury);

      const juryAudit = await request(app)
        .get('/api/admin/audit-log')
        .set('Authorization', `Bearer ${juryToken}`);
      expect(juryAudit.status).toBe(403);

      const limited = await request(app)
        .get('/api/admin/audit-log')
        .query({ limit: 1, offset: 0 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(limited.status).toBe(200);
      expect(limited.body.items.length).toBeLessThanOrEqual(1);
      expect(typeof limited.body.total).toBe('number');

      const bad = await request(app)
        .get('/api/admin/audit-log')
        .query({ limit: 1000 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(bad.status).toBe(400);
    });
  });
});
