import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { adminCtfOverviewResponseSchema, type AdminCtfOverviewResponse } from 'api-contracts';
import { createApp } from '../app';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { hashPassword } from '../modules/auth/password.service';
import { getAnswerPepper, hashAnswer } from '../modules/ctf/ctf-answer';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * `GET /api/admin/ctf`: the administrators' Mini-CTF board. The flags below are
 * test-only fixtures; real event flags never appear in this repository.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'admin-ctf-password-2026';
const MINUTE = 60_000;

const STAGES = [1, 2, 3].map((position) => ({
  slug: `ac-0${position}`,
  position,
  title: `Board stage ${position}`,
  answer: `FIXTURE{board-${position}}`,
}));

describeDb('admin Mini-CTF board', () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();

    const admin = await createUser({
      role: 'admin',
      name: 'Board Admin',
      email: 'ac-admin@test.local',
      passwordHash: await hashPassword(PASSWORD),
    });
    adminUserId = admin.id;
    adminToken = (await createSessionForUser(admin.id)).token;

    for (const stage of STAGES) {
      await prisma.ctfStage.create({
        data: {
          slug: stage.slug,
          position: stage.position,
          title: stage.title,
          description: `Description for ${stage.title}`,
          status: 'live',
          answerHash: hashAnswer(stage.answer),
          assetDriveUrl: stage.position === 1 ? 'https://drive.google.com/drive/folders/x' : null,
          requiredForUnlock: true,
          hints: { create: [{ position: 1, body: `Hint for ${stage.slug}` }] },
        },
      });
    }
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function board(): Promise<AdminCtfOverviewResponse> {
    const response = await request(app).get('/api/admin/ctf').set(auth(adminToken));
    expect(response.status).toBe(200);
    // The response must satisfy the shared contract exactly (strict objects).
    return adminCtfOverviewResponseSchema.parse(response.body);
  }

  async function setPhase(phase: string, ctfStartedAt: Date | null = null) {
    const response = await request(app)
      .post('/api/event-state')
      .set(auth(adminToken))
      .send({ phase, force: true });
    expect(response.status).toBe(200);
    if (ctfStartedAt !== null) {
      await prisma.eventPhaseState.update({ where: { id: 1 }, data: { ctfStartedAt } });
    }
  }

  async function registerTeam(slug: string): Promise<{ teamId: string; token: string }> {
    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: `AC ${slug}`,
        leader: {
          name: 'AC Leader',
          email: `leader@ac-${slug}.test`,
          password: PASSWORD,
          university: 'Test University',
          phone: '+216 20 123 456',
        },
        members: [1, 2, 3].map((n) => ({
          name: `AC ${slug} ${n}`,
          email: `m${n}@ac-${slug}.test`,
          university: 'Test University',
          phone: '+216 20 123 456',
        })),
      });
    expect(response.status).toBe(201);
    const teamId = response.body.id as string;
    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { leaderId: true },
    });
    return { teamId, token: (await createSessionForUser(team.leaderId)).token };
  }

  async function checkIn(teamId: string): Promise<void> {
    const leader = await prisma.participant.findFirstOrThrow({
      where: { teamId, isLeader: true },
      select: { id: true },
    });
    await prisma.checkInRecord.create({
      data: { participantId: leader.id, checkedByUserId: adminUserId },
    });
    await prisma.team.update({ where: { id: teamId }, data: { progressState: 'checked_in' } });
  }

  function submit(token: string, slug: string, answer: string) {
    return request(app).post(`/api/ctf/stages/${slug}/submit`).set(auth(token)).send({ answer });
  }

  it('is reserved to administrators', async () => {
    const anonymous = await request(app).get('/api/admin/ctf');
    expect(anonymous.status).toBe(401);

    const team = await registerTeam('role');
    const asTeam = await request(app).get('/api/admin/ctf').set(auth(team.token));
    expect(asTeam.status).toBe(403);
  });

  it('reports the stage configuration and every team before the launch', async () => {
    await prisma.ctfStage.create({
      data: {
        slug: 'ac-04',
        position: 4,
        title: 'Board stage 4',
        status: 'draft',
        answerHash: null,
        requiredForUnlock: true,
      },
    });
    const present = await registerTeam('present');
    await checkIn(present.teamId);
    await registerTeam('absent');

    const body = await board();

    expect(body.phase).toBe('registration');
    expect(body.timing).toMatchObject({ startedAt: null, closesAt: null, open: false });
    expect(body.windowMinutes).toBe(60);
    expect(body.totals).toMatchObject({
      stages: 4,
      liveStages: 3,
      blockingStages: 1,
      teams: 2,
      checkedInTeams: 1,
      startedTeams: 0,
      completedTeams: 0,
    });
    expect(body.stages.map((stage) => [stage.slug, stage.answerConfigured])).toEqual([
      ['ac-01', true],
      ['ac-02', true],
      ['ac-03', true],
      ['ac-04', false],
    ]);
    expect(body.stages[0]).toMatchObject({ hasDriveUrl: true, hintCount: 1, solvedTeams: 0 });
    expect(body.stages[1].hasDriveUrl).toBe(false);
    expect(body.teams.find((team) => team.teamId === present.teamId)).toMatchObject({
      checkedIn: true,
      currentStagePosition: null,
      solvedStages: 0,
      attempts: 0,
    });
    expect(body.teams.find((team) => team.teamName === 'AC absent')?.checkedIn).toBe(false);
  });

  it('follows a team through the chain: current stage, attempts and hints', async () => {
    const team = await registerTeam('runner');
    await checkIn(team.teamId);
    await setPhase('live', new Date(Date.now() - 5 * MINUTE));

    const wrong = await submit(team.token, 'ac-01', 'FIXTURE{nope}');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('CTF_NOT_SOLVED');
    const right = await submit(team.token, 'ac-01', STAGES[0].answer);
    expect(right.status).toBe(200);
    const hint = await request(app).post('/api/ctf/stages/ac-02/hints').set(auth(team.token));
    expect(hint.status).toBe(200);

    const body = await board();

    expect(body.timing.open).toBe(true);
    expect(body.timing.startedAt).not.toBeNull();
    expect(body.teams[0]).toMatchObject({
      teamId: team.teamId,
      currentStagePosition: 2,
      solvedStages: 1,
      attempts: 2,
      hintsUsed: 1,
      chainSolvedAt: null,
      points: null,
    });
    expect(body.teams[0].lastActivityAt).not.toBeNull();
    expect(body.stages[0]).toMatchObject({ solvedTeams: 1, attempts: 2 });
    expect(body.totals).toMatchObject({ startedTeams: 1, completedTeams: 0 });
  });

  it('lists finished teams first with their solve time and points', async () => {
    const finisher = await registerTeam('finisher');
    const starter = await registerTeam('starter');
    await checkIn(finisher.teamId);
    await checkIn(starter.teamId);
    await setPhase('live', new Date(Date.now() - 10 * MINUTE));

    for (const stage of STAGES) {
      expect((await submit(finisher.token, stage.slug, stage.answer)).status).toBe(200);
    }
    expect((await submit(starter.token, 'ac-01', STAGES[0].answer)).status).toBe(200);

    const body = await board();

    expect(body.teams.map((team) => team.teamId)).toEqual([finisher.teamId, starter.teamId]);
    expect(body.teams[0]).toMatchObject({
      currentStagePosition: null,
      solvedStages: 3,
      points: 10,
    });
    expect(body.teams[0].chainSolvedAt).not.toBeNull();
    expect(body.teams[1]).toMatchObject({ currentStagePosition: 2, solvedStages: 1 });
    expect(body.totals).toMatchObject({ startedTeams: 2, completedTeams: 1 });
  });

  it('never exposes answers, digests or the pepper', async () => {
    const team = await registerTeam('secret');
    await checkIn(team.teamId);
    await setPhase('live', new Date());
    await submit(team.token, 'ac-01', STAGES[0].answer);

    const response = await request(app).get('/api/admin/ctf').set(auth(adminToken));
    const serialized = JSON.stringify(response.body);

    for (const stage of STAGES) {
      expect(serialized).not.toContain(stage.answer);
      expect(serialized).not.toContain(hashAnswer(stage.answer));
    }
    expect(serialized).not.toContain(getAnswerPepper());
    expect(serialized).not.toContain('answerHash');
  });
});
