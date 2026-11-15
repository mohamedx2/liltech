import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  adminChallengeListResponseSchema,
  currentChallengeResponseSchema,
  teamChallengeListResponseSchema,
} from 'api-contracts';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { setBadgeMailTransport } from '../modules/badges/badge-mailer';
import { challengeAccessFor, recordMiniCtfSolve } from '../modules/challenges/challenges.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Two sequential challenges with Mini-CTF early access.
 * Runs against TEST_DATABASE_URL; skips when it is absent.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'challenge-password-2026';
const HOUR = 60 * 60 * 1000;

describe('challengeAccessFor', () => {
  const now = new Date('2026-11-21T19:30:00Z');
  const later = new Date('2026-11-21T20:00:00Z');
  const earlier = new Date('2026-11-21T19:00:00Z');

  it('locks an upcoming challenge even for a team that solved its Mini-CTF', () => {
    expect(challengeAccessFor({ status: 'upcoming', publicAt: null }, true, now)).toBe('locked');
  });

  it('gives early access to Mini-CTF solvers before the public time', () => {
    expect(challengeAccessFor({ status: 'live', publicAt: later }, true, now)).toBe('early');
    expect(challengeAccessFor({ status: 'live', publicAt: later }, false, now)).toBe('locked');
  });

  it('opens to everyone at the public time and after the end', () => {
    expect(challengeAccessFor({ status: 'live', publicAt: earlier }, false, now)).toBe('public');
    expect(challengeAccessFor({ status: 'ended', publicAt: later }, false, now)).toBe('public');
  });
});

describeDb('challenges', () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let juryToken: string;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
    app = createApp();
    setBadgeMailTransport(null);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();

    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createUser({
      role: 'admin',
      name: 'Admin',
      email: 'admin@ch.test',
      passwordHash,
    });
    const jury = await createUser({
      role: 'jury',
      name: 'Juror',
      email: 'jury@ch.test',
      passwordHash,
    });
    adminToken = (await createSessionForUser(admin.id)).token;
    juryToken = (await createSessionForUser(jury.id)).token;
  });

  afterAll(async () => {
    setBadgeMailTransport(undefined);
    await destroyIntegrationDatabase();
  });

  const asAdmin = (call: request.Test) => call.set('Authorization', `Bearer ${adminToken}`);

  async function setPhase(phase: string) {
    const response = await asAdmin(request(app).post('/api/event-state')).send({
      phase,
      force: true,
    });
    expect(response.status).toBe(200);
  }

  async function createChallenge(position: number) {
    const response = await asAdmin(request(app).post('/api/admin/challenges')).send({
      position,
      title: `Challenge ${position}`,
      summary: `Teaser ${position}`,
      description: `Full description ${position}`,
      problemStatement: `Problem ${position}`,
      deliverables: ['A repository'],
      resources: [{ name: 'Dataset', url: 'https://example.com/data' }],
    });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  async function registerTeam(slug: string, { checkedIn = true } = {}) {
    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: `Team ${slug}`,
        leader: { name: `${slug} Leader`, email: `leader@${slug}.test`, password: PASSWORD },
        members: [1, 2, 3].map((n) => ({ name: `${slug} ${n}`, email: `m${n}@${slug}.test` })),
      });
    expect(response.status).toBe(201);
    if (checkedIn) {
      const scan = await asAdmin(request(app).post('/api/checkin/scan')).send({
        token: (response.body.badges as Array<{ token: string }>)[0].token,
      });
      expect(scan.status).toBe(200);
    }
    const leader = await prisma.user.findUniqueOrThrow({ where: { email: `leader@${slug}.test` } });
    return {
      teamId: response.body.id as string,
      token: (await createSessionForUser(leader.id)).token,
    };
  }

  describe('admin lifecycle', () => {
    it('refuses to start or end a challenge unless the event is live', async () => {
      const first = await createChallenge(1);

      for (const phase of ['registration', 'checkin']) {
        if (phase !== 'registration') await setPhase(phase);
        const start = await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));
        expect(start.status).toBe(409);
        expect(start.body.error.message).toContain('while the event is live');
      }

      await setPhase('live');
      expect(
        (await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`))).status,
      ).toBe(200);

      await setPhase('submissions_closed');
      const end = await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      expect(end.status).toBe(409);
    });

    it('runs the challenges one at a time, in order, with a one-hour public delay', async () => {
      const first = await createChallenge(1);
      const second = await createChallenge(2);
      await setPhase('live');

      const outOfOrder = await asAdmin(
        request(app).post(`/api/admin/challenges/${second.id}/start`),
      );
      expect(outOfOrder.status).toBe(409);

      const started = await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));
      expect(started.status).toBe(200);
      expect(started.body.status).toBe('live');
      expect(
        new Date(started.body.publicAt).getTime() - new Date(started.body.startedAt).getTime(),
      ).toBe(HOUR);

      expect(
        (await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`))).status,
      ).toBe(409);
      expect(
        (await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`))).status,
      ).toBe(409);

      const ended = await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      expect(ended.status).toBe(200);
      expect(ended.body.status).toBe('ended');
      expect(
        (await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`))).status,
      ).toBe(409);
      expect(
        (await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`))).status,
      ).toBe(409);

      expect(
        (await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`))).status,
      ).toBe(200);

      const list = await asAdmin(request(app).get('/api/admin/challenges'));
      expect(adminChallengeListResponseSchema.parse(list.body).items.map((c) => c.status)).toEqual([
        'ended',
        'live',
      ]);
      expect(await prisma.auditLog.count({ where: { action: 'challenge.started' } })).toBe(2);
      expect(await prisma.auditLog.count({ where: { action: 'challenge.ended' } })).toBe(1);
    });

    it('refuses a duplicate position and validates input', async () => {
      await createChallenge(1);
      const duplicate = await asAdmin(request(app).post('/api/admin/challenges')).send({
        position: 1,
        title: 'Again',
        description: 'Again',
      });
      expect(duplicate.status).toBe(409);

      const invalid = await asAdmin(request(app).post('/api/admin/challenges')).send({
        position: 3,
        title: 'Bad',
        description: 'Bad',
        status: 'live',
      });
      expect(invalid.status).toBe(400);
    });

    it('is admin-only', async () => {
      const first = await createChallenge(1);
      const team = await registerTeam('rbac');

      for (const token of [team.token, juryToken]) {
        const list = await request(app)
          .get('/api/admin/challenges')
          .set('Authorization', `Bearer ${token}`);
        const start = await request(app)
          .post(`/api/admin/challenges/${first.id}/start`)
          .set('Authorization', `Bearer ${token}`);
        expect(list.status).toBe(403);
        expect(start.status).toBe(403);
      }

      const juryView = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${juryToken}`);
      expect(juryView.status).toBe(403);
    });
  });

  describe('team view', () => {
    it('says the hackathon has not started before the live phase', async () => {
      await createChallenge(1);
      const team = await registerTeam('early');

      const current = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${team.token}`);
      expect(current.status).toBe(200);
      expect(currentChallengeResponseSchema.parse(current.body)).toMatchObject({
        available: false,
        reason: 'EVENT_NOT_STARTED',
      });

      const list = await request(app)
        .get('/api/challenges')
        .set('Authorization', `Bearer ${team.token}`);
      expect(teamChallengeListResponseSchema.parse(list.body).available).toBe(false);
    });

    it('keeps challenges closed to a team with nobody checked in', async () => {
      const first = await createChallenge(1);
      const absent = await registerTeam('absent', { checkedIn: false });
      await setPhase('live');
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));
      await prisma.challenge.update({
        where: { id: first.id },
        data: { publicAt: new Date(Date.now() - 1000) },
      });

      const current = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${absent.token}`);
      expect(current.body).toMatchObject({ available: false, reason: 'NOT_CHECKED_IN' });
      expect(JSON.stringify(current.body)).not.toContain('Full description 1');
    });

    it('says no challenge has started while the event is live but none runs', async () => {
      await createChallenge(1);
      const team = await registerTeam('waiting');
      await setPhase('live');

      const current = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${team.token}`);
      expect(current.body).toMatchObject({ available: false, reason: 'NO_CHALLENGE_STARTED' });
    });

    it('gives early access only to the team that solved the challenge Mini-CTF', async () => {
      const first = await createChallenge(1);
      const solver = await registerTeam('solver');
      const other = await registerTeam('other');
      await setPhase('live');
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));
      expect(await recordMiniCtfSolve(solver.teamId, first.id)).toBe(true);
      expect(await recordMiniCtfSolve(solver.teamId, first.id)).toBe(true);

      const solverView = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${solver.token}`);
      const solverBody = currentChallengeResponseSchema.parse(solverView.body);
      expect(solverBody.available && solverBody.current.access).toBe('early');
      expect(solverBody.available && solverBody.current.content?.description).toBe(
        'Full description 1',
      );

      const otherView = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${other.token}`);
      const otherBody = currentChallengeResponseSchema.parse(otherView.body);
      expect(otherBody.available && otherBody.current.access).toBe('locked');
      expect(otherBody.available && otherBody.current.content).toBeNull();
      expect(otherBody.available && otherBody.current.challenge.summary).toBe('Teaser 1');
      expect(JSON.stringify(otherView.body)).not.toContain('Full description 1');
    });

    it('opens the description to every team at the public time and after the end', async () => {
      const first = await createChallenge(1);
      const team = await registerTeam('public');
      await setPhase('live');
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));

      await prisma.challenge.update({
        where: { id: first.id },
        data: { publicAt: new Date(Date.now() - 1000) },
      });
      const atPublic = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${team.token}`);
      expect(atPublic.body.current.access).toBe('public');

      await prisma.challenge.update({
        where: { id: first.id },
        data: { publicAt: new Date(Date.now() + HOUR) },
      });
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      const afterEnd = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${team.token}`);
      expect(afterEnd.body.current).toMatchObject({ access: 'public' });
      expect(afterEnd.body.current.challenge.status).toBe('ended');
    });

    it('lists both challenges with per-challenge access', async () => {
      const first = await createChallenge(1);
      const second = await createChallenge(2);
      const team = await registerTeam('lister');
      await setPhase('live');
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));
      await recordMiniCtfSolve(team.teamId, second.id);

      const list = await request(app)
        .get('/api/challenges')
        .set('Authorization', `Bearer ${team.token}`);
      const body = teamChallengeListResponseSchema.parse(list.body);
      expect(body.available && body.items.map((item) => [item.access, item.ctfSolved])).toEqual([
        ['locked', false],
        ['locked', true],
      ]);
    });
  });
});
