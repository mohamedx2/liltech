import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  adminJuryAccountDetailSchema,
  adminResultsResponseSchema,
  teamResultSchema,
} from 'api-contracts';
import { createApp } from '../app';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { hashPassword } from '../modules/auth/password.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Results board and score overrides: CTF 10 pts + Challenge 1 20% + Challenge 2
 * 70%, jurors scoring only their own challenge, and only administrators
 * editing a team's scores.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'results-suite-password-2026';

describeDb('results and score overrides', () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let challenge1: string;
  let challenge2: string;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const asAdmin = (call: request.Test) => call.set(auth(adminToken));

  beforeEach(async () => {
    await resetIntegrationDatabase();
    const admin = await createUser({
      role: 'admin',
      name: 'Results Admin',
      email: 'results-admin@test.local',
      passwordHash: await hashPassword(PASSWORD),
    });
    adminUserId = admin.id;
    adminToken = (await createSessionForUser(admin.id)).token;

    const ids: string[] = [];
    for (const position of [1, 2]) {
      const created = await asAdmin(request(app).post('/api/admin/challenges')).send({
        position,
        title: `Challenge ${position}`,
        description: `Brief ${position}`,
      });
      expect(created.status).toBe(201);
      ids.push(created.body.id as string);
    }
    [challenge1, challenge2] = ids;
  });

  async function registerTeam(slug: string) {
    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: `Team ${slug}`,
        leader: {
          name: `${slug} Leader`,
          email: `leader@${slug}.test`,
          password: PASSWORD,
          university: 'Test University',
          phone: '+216 20 123 456',
        },
        members: [1, 2, 3].map((n) => ({
          name: `${slug} Member ${n}`,
          email: `m${n}@${slug}.test`,
          university: 'Test University',
          phone: '+216 20 123 456',
        })),
      });
    expect(response.status).toBe(201);
    const teamId = response.body.id as string;
    const leader = await prisma.participant.findFirstOrThrow({
      where: { teamId, isLeader: true },
      select: { id: true },
    });
    await prisma.checkInRecord.create({
      data: { participantId: leader.id, checkedByUserId: adminUserId },
    });
    await prisma.team.update({ where: { id: teamId }, data: { progressState: 'checked_in' } });
    return teamId;
  }

  async function createJury(email: string, challengeId: string) {
    const response = await asAdmin(request(app).post('/api/admin/jury')).send({
      name: email.split('@')[0],
      email,
      challengeId,
    });
    expect(response.status).toBe(201);
    const account = adminJuryAccountDetailSchema.parse(response.body);
    return { ...account, token: (await createSessionForUser(account.id)).token };
  }

  async function scoreAll(token: string, teamId: string, value: number) {
    const response = await request(app)
      .post(`/api/jury/evaluation?teamId=${teamId}`)
      .set(auth(token))
      .send({
        criteriaScores: {
          technical_execution: value,
          innovation_originality: value,
          ui_ux_design: value,
          pitch_presentation: value,
        },
      });
    expect(response.status).toBe(200);
  }

  async function results() {
    const response = await asAdmin(request(app).get('/api/admin/results'));
    expect(response.status).toBe(200);
    return adminResultsResponseSchema.parse(response.body);
  }

  it('starts every team at 0 and combines CTF 10 + C1 20% + C2 70%', async () => {
    const fast = await registerTeam('fast');
    const idle = await registerTeam('idle');
    await prisma.team.update({ where: { id: fast }, data: { ctfPoints: 7 } });

    const juryC1 = await createJury('c1@jury.test', challenge1);
    const juryC2a = await createJury('c2a@jury.test', challenge2);
    const juryC2b = await createJury('c2b@jury.test', challenge2);
    await asAdmin(request(app).post('/api/event-state')).send({
      phase: 'submissions_closed',
      force: true,
    });

    await scoreAll(juryC1.token, fast, 20); // 80/100
    await scoreAll(juryC2a.token, fast, 25); // 100/100
    await scoreAll(juryC2b.token, fast, 15); // 60/100 → average 80

    const board = await results();
    const fastRow = board.teams.find((team) => team.teamId === fast);
    const idleRow = board.teams.find((team) => team.teamId === idle);

    expect(fastRow).toMatchObject({ rank: 1, total: 7 + 16 + 56, ctf: { points: 7 } });
    expect(fastRow?.challenges).toEqual([
      expect.objectContaining({ position: 1, juryAverage: 80, jurorCount: 1, points: 16 }),
      expect.objectContaining({ position: 2, juryAverage: 80, jurorCount: 2, points: 56 }),
    ]);
    expect(idleRow).toMatchObject({ rank: 2, total: 0, ctf: { automatic: null, points: 0 } });
  });

  it('lets an administrator set and clear overrides, audited', async () => {
    const teamId = await registerTeam('override');

    const updated = await asAdmin(request(app).patch(`/api/admin/teams/${teamId}/scores`)).send({
      ctfPoints: 4.5,
      challenge1Score: 50,
      challenge2Score: 100,
    });
    expect(updated.status).toBe(200);
    expect(teamResultSchema.parse(updated.body)).toMatchObject({
      total: 4.5 + 10 + 70,
      ctf: { automatic: null, override: 4.5, points: 4.5 },
    });

    const cleared = await asAdmin(request(app).patch(`/api/admin/teams/${teamId}/scores`)).send({
      challenge2Score: null,
    });
    expect(cleared.body).toMatchObject({ total: 14.5 });

    const audit = await prisma.auditLog.findMany({
      where: { action: 'team.scores_updated', targetId: teamId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.summary)).toEqual([
      'ctf = 4.5; challenge 1 = 50; challenge 2 = 100',
      'challenge 2 override cleared',
    ]);
  });

  it('keeps score editing and the results board admin-only', async () => {
    const teamId = await registerTeam('guarded');
    const jury = await createJury('guard@jury.test', challenge1);
    const leader = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { leaderId: true },
    });
    const teamToken = (await createSessionForUser(leader.leaderId)).token;

    for (const token of [jury.token, teamToken]) {
      const edit = await request(app)
        .patch(`/api/admin/teams/${teamId}/scores`)
        .set(auth(token))
        .send({ ctfPoints: 10 });
      expect(edit.status).toBe(403);
      const board = await request(app).get('/api/admin/results').set(auth(token));
      expect(board.status).toBe(403);
    }
    const anonymous = await request(app).get('/api/admin/results');
    expect(anonymous.status).toBe(401);

    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.ctfPointsOverride).toBeNull();
  });

  it('refuses out-of-range scores, unknown fields, empty bodies and unknown teams', async () => {
    const teamId = await registerTeam('invalid');
    const patch = (body: object, id = teamId) =>
      asAdmin(request(app).patch(`/api/admin/teams/${id}/scores`)).send(body);

    expect((await patch({ ctfPoints: 10.5 })).status).toBe(400);
    expect((await patch({ challenge1Score: 101 })).status).toBe(400);
    expect((await patch({ challenge2Score: -1 })).status).toBe(400);
    expect((await patch({ challenge2Score: 50.123 })).status).toBe(400);
    expect((await patch({ total: 100 })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ ctfPoints: 5 }, '00000000-0000-4000-8000-000000000000')).status).toBe(
      404,
    );
  });
});
