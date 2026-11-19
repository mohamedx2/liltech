import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../app';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { hashPassword } from '../modules/auth/password.service';
import { hashAnswer } from '../modules/ctf/ctf-answer';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Database-backed tests for the LOUAGE 404 sequential chain.
 *
 * The flags below are test-only fixture answers; the real event flags never
 * appear in this repository.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const TEST_PEPPER = 'integration-test-pepper-0123456789';
const LEADER_PASSWORD = 'leader-password-2026';

/** Fixture stages 01..07 with test-only answers. */
const FIXTURE_STAGES = [1, 2, 3, 4, 5, 6, 7].map((position) => ({
  slug: `fixture-0${position}`,
  position,
  title: `Fixture stage ${position}`,
  answer: `FIXTURE{stage-${position}-answer}`,
}));

describeDb('LOUAGE 404 chain', () => {
  let app: Express;
  let prisma: PrismaClient;
  /** Admin used for check-in records and the challenge setup. */
  let adminUserId: string;

  beforeAll(async () => {
    process.env.CTF_ANSWER_PEPPER = TEST_PEPPER;
    prisma = await initIntegrationDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();

    // Registration stays open in `checkin`; each ready team launches the CTF.
    await prisma.eventPhaseState.create({ data: { phase: 'checkin' } });

    const admin = await createUser({
      role: 'admin',
      name: 'CTF Admin',
      email: 'ctf-admin@test.local',
      passwordHash: await hashPassword(LEADER_PASSWORD),
    });
    adminUserId = admin.id;

    for (const stage of FIXTURE_STAGES) {
      await prisma.ctfStage.create({
        data: {
          slug: stage.slug,
          position: stage.position,
          title: stage.title,
          description: `Description for ${stage.title}`,
          status: 'live',
          answerHash: hashAnswer(stage.answer, TEST_PEPPER),
          requiredForUnlock: true,
          hints: {
            create: [
              { position: 1, body: `Hint one for ${stage.slug}` },
              { position: 2, body: `Hint two for ${stage.slug}` },
            ],
          },
        },
      });
    }
  });

  async function registerTeam(suffix: string): Promise<{ teamId: string; token: string }> {
    const email = `ctf-${suffix}@test.local`;

    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: `CTF ${suffix}`,
        leader: {
          name: 'CTF Leader',
          email,
          password: LEADER_PASSWORD,
          university: 'Test University',
          phone: '+216 20 123 456',
        },
        members: [
          {
            name: 'Member One',
            email: `one.${email}`,
            university: 'Test University',
            phone: '+216 20 123 456',
          },
          {
            name: 'Member Two',
            email: `two.${email}`,
            university: 'Test University',
            phone: '+216 20 123 456',
          },
          {
            name: 'Member Three',
            email: `three.${email}`,
            university: 'Test University',
            phone: '+216 20 123 456',
          },
        ],
      });

    expect(response.status).toBe(201);

    // Mint a session directly: the login endpoint is rate limited per IP, and
    // this suite signs in many teams from one address.
    const teamId = response.body.id as string;
    const created = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { leaderId: true },
    });
    const { token } = await createSessionForUser(created.leaderId);

    return { teamId, token };
  }

  async function checkIn(teamId: string): Promise<void> {
    await prisma.team.update({
      where: { id: teamId },
      data: { progressState: 'checked_in' },
    });

    // The challenge module reads the venue check-in record, not just the team
    // progress state, so a real check-in writes both.
    const leader = await prisma.participant.findFirstOrThrow({
      where: { teamId, isLeader: true },
      select: { id: true },
    });
    await prisma.checkInRecord.create({
      data: { participantId: leader.id, checkedByUserId: adminUserId },
    });
  }

  /**
   * Puts the event live with one running challenge whose public reveal is far
   * away, so challenge access is decided only by Mini-CTF completion.
   */
  async function liveRunningChallenge(): Promise<void> {
    const { token } = await createSessionForUser(adminUserId);
    const auth = { Authorization: `Bearer ${token}` };

    const phase = await request(app)
      .post('/api/event-state')
      .set(auth)
      .send({ phase: 'live', force: true });
    expect(phase.status).toBe(200);

    const created = await request(app)
      .post('/api/admin/challenges')
      .set(auth)
      .send({
        position: 1,
        title: 'Main challenge',
        summary: 'Teaser',
        description: 'Full description',
        problemStatement: 'Problem statement',
        deliverables: ['A repository'],
        resources: [],
        publicDelayMinutes: 600,
      });
    expect(created.status).toBe(201);

    const started = await request(app)
      .post(`/api/admin/challenges/${created.body.id}/start`)
      .set(auth);
    expect(started.status).toBe(200);
  }

  async function readyTeam(suffix: string): Promise<{ teamId: string; token: string }> {
    const team = await registerTeam(suffix);
    await checkIn(team.teamId);
    // The Mini-CTF only opens once the server recorded the launch instant.
    await prisma.eventPhaseState.update({
      where: { id: 1 },
      data: { phase: 'live', ctfStartedAt: new Date() },
    });
    return team;
  }

  function submit(token: string, slug: string, answer: string) {
    return request(app)
      .post(`/api/ctf/stages/${slug}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answer });
  }

  it('rejects unauthenticated access to the chain', async () => {
    const response = await request(app).get('/api/ctf/chain');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects non-team roles', async () => {
    const jury = await createUser({
      role: 'jury',
      name: 'Jury',
      email: 'ctf-jury@test.local',
      passwordHash: await hashPassword(LEADER_PASSWORD),
    });

    const { token } = await createSessionForUser(jury.id);

    const response = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('opens stage 1 for a checked-in team and locks the rest', async () => {
    const team = await readyTeam('stage-one');
    const response = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(response.status).toBe(200);
    expect(response.body.eligible).toBe(true);
    expect(response.body.stages[0].state).toBe('unlocked');
    expect(
      response.body.stages.slice(1).every((s: { state: string }) => s.state === 'locked'),
    ).toBe(true);
    expect(response.body.current.stage.slug).toBe('fixture-01');
    expect(response.body.summary).toEqual({ solved: 0, total: 7 });
  });

  it('keeps the chain shut for a team that has not checked in', async () => {
    const team = await registerTeam('not-checked-in');
    const response = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(response.body.eligible).toBe(false);
    expect(response.body.current).toBeNull();
    expect(response.body.stages.every((s: { state: string }) => s.state === 'locked')).toBe(true);
  });

  it('records a wrong answer without unlocking the next stage', async () => {
    const team = await readyTeam('wrong');
    const wrong = await submit(team.token, 'fixture-01', 'FIXTURE{not-the-answer}');

    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('CTF_NOT_SOLVED');

    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(chain.body.stages[0].state).toBe('unlocked');
    expect(chain.body.stages[1].state).toBe('locked');
    expect(chain.body.current.progress.attempts).toBe(1);

    const attempts = await prisma.ctfAttempt.count({ where: { teamId: team.teamId } });
    expect(attempts).toBe(1);
  });

  it('refuses stage 2 while stage 1 is unsolved', async () => {
    const team = await readyTeam('skip');

    const skipped = await submit(team.token, 'fixture-02', FIXTURE_STAGES[1].answer);
    expect(skipped.status).toBe(403);
    expect(skipped.body.error.code).toBe('FORBIDDEN');

    const detail = await request(app)
      .get('/api/ctf/stages/fixture-02')
      .set('Authorization', `Bearer ${team.token}`);
    expect(detail.status).toBe(403);

    const hints = await request(app)
      .post('/api/ctf/stages/fixture-02/hints')
      .set('Authorization', `Bearer ${team.token}`);
    expect(hints.status).toBe(403);
  });

  it('solves stage 1 and unlocks stage 2 in one step', async () => {
    const team = await readyTeam('solve-one');

    const solved = await submit(team.token, 'fixture-01', FIXTURE_STAGES[0].answer);
    expect(solved.status).toBe(200);
    expect(solved.body).toMatchObject({
      correct: true,
      stageSolved: true,
      nextStageUnlocked: true,
      nextStagePosition: 2,
      completedChain: false,
    });

    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(chain.body.stages[0].state).toBe('solved');
    expect(chain.body.stages[1].state).toBe('unlocked');
    expect(chain.body.current.stage.slug).toBe('fixture-02');
    expect(chain.body.summary.solved).toBe(1);
  });

  it('accepts formatting variants of a flag', async () => {
    const team = await readyTeam('variants');

    const solved = await submit(team.token, 'fixture-01', '  fixture{STAGE-1-ANSWER}  ');
    expect(solved.status).toBe(200);
  });

  it('keeps two teams independent', async () => {
    // Register both before going live: registration closes at the launch.
    const first = await registerTeam('independent-a');
    const second = await registerTeam('independent-b');
    await checkIn(first.teamId);
    await checkIn(second.teamId);
    await prisma.eventPhaseState.update({
      where: { id: 1 },
      data: { phase: 'live', ctfStartedAt: new Date() },
    });

    await submit(first.token, 'fixture-01', FIXTURE_STAGES[0].answer);

    const secondChain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${second.token}`);

    expect(secondChain.body.stages[0].state).toBe('unlocked');
    expect(secondChain.body.stages[1].state).toBe('locked');
    expect(secondChain.body.summary.solved).toBe(0);

    const secondAttempt = await submit(second.token, 'fixture-02', FIXTURE_STAGES[1].answer);
    expect(secondAttempt.status).toBe(403);
  });

  it('is idempotent on replay and never duplicates the solve', async () => {
    const team = await readyTeam('replay');

    const first = await submit(team.token, 'fixture-01', FIXTURE_STAGES[0].answer);
    const solvedAt = await prisma.ctfProgress
      .findFirstOrThrow({ where: { teamId: team.teamId, stage: { slug: 'fixture-01' } } })
      .then((row) => row.solvedAt);

    const second = await submit(team.token, 'fixture-01', FIXTURE_STAGES[0].answer);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.stageSolved).toBe(true);
    expect(second.body.message).toContain('already solved');

    const progress = await prisma.ctfProgress.findFirst({
      where: { teamId: team.teamId, stage: { slug: 'fixture-01' } },
    });

    expect(progress?.solvedAt).toEqual(solvedAt);
    expect(
      await prisma.ctfAttempt.count({ where: { teamId: team.teamId, outcome: 'correct' } }),
    ).toBe(1);
    expect(
      await prisma.ctfProgress.count({
        where: { teamId: team.teamId, stage: { slug: 'fixture-02' } },
      }),
    ).toBe(1);
  });

  it('survives concurrent correct submissions without duplicate solves', async () => {
    const team = await readyTeam('concurrent');

    const results = await Promise.all([
      submit(team.token, 'fixture-01', FIXTURE_STAGES[0].answer),
      submit(team.token, 'fixture-01', FIXTURE_STAGES[0].answer),
      submit(team.token, 'fixture-01', FIXTURE_STAGES[0].answer),
    ]);

    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(
      await prisma.ctfAttempt.count({ where: { teamId: team.teamId, outcome: 'correct' } }),
    ).toBe(1);
    expect(
      await prisma.ctfProgress.count({
        where: { teamId: team.teamId, stage: { slug: 'fixture-01' } },
      }),
    ).toBe(1);
  });

  it('rate limits after five attempts in a minute', async () => {
    const team = await readyTeam('rate-limit');

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await submit(team.token, 'fixture-01', `FIXTURE{wrong-${attempt}}`);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);

    const blocked = await prisma.ctfAttempt.count({
      where: { teamId: team.teamId, outcome: 'rate_limited' },
    });
    expect(blocked).toBe(1);
  });

  it('reveals hints one at a time and refuses more than exist', async () => {
    const team = await readyTeam('hints');

    const first = await request(app)
      .post('/api/ctf/stages/fixture-01/hints')
      .set('Authorization', `Bearer ${team.token}`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ hintsUsed: 1, hintCount: 2 });
    expect(first.body.hint.position).toBe(1);

    const second = await request(app)
      .post('/api/ctf/stages/fixture-01/hints')
      .set('Authorization', `Bearer ${team.token}`);
    expect(second.body.hintsUsed).toBe(2);

    const third = await request(app)
      .post('/api/ctf/stages/fixture-01/hints')
      .set('Authorization', `Bearer ${team.token}`);
    expect(third.status).toBe(409);

    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);
    expect(chain.body.current.hints).toHaveLength(2);
  });

  it('keeps the main challenge locked until every required stage is solved', async () => {
    const team = await readyTeam('main-locked');
    await liveRunningChallenge();

    for (let index = 0; index < FIXTURE_STAGES.length - 1; index++) {
      const stage = FIXTURE_STAGES[index];
      const solved = await submit(team.token, stage.slug, stage.answer);
      expect(solved.status).toBe(200);
    }

    // Challenge access is the merged contract: a running challenge whose public
    // reveal has not happened yet stays `locked` (no content) until the chain is
    // finished, then becomes `early`.
    const beforeLast = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${team.token}`);
    expect(beforeLast.status).toBe(200);
    expect(beforeLast.body.available).toBe(true);
    expect(beforeLast.body.current.access).toBe('locked');
    expect(beforeLast.body.current.content).toBeNull();

    const last = FIXTURE_STAGES[FIXTURE_STAGES.length - 1];
    const solved = await submit(team.token, last.slug, last.answer);
    expect(solved.body.completedChain).toBe(true);

    const after = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${team.token}`);
    expect(after.status).toBe(200);
    expect(after.body.available).toBe(true);
    expect(after.body.current.access).toBe('early');
    expect(after.body.current.content).not.toBeNull();

    const teamRow = await prisma.team.findUnique({ where: { id: team.teamId } });
    expect(teamRow?.progressState).toBe('challenge_unlocked');

    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);
    expect(chain.body.current).toBeNull();
    expect(chain.body.summary.solved).toBe(7);
  });

  it('keeps an unconfigured draft stage unsolvable without bypassing it', async () => {
    await prisma.ctfStage.update({
      where: { slug: 'fixture-05' },
      data: { status: 'draft', answerHash: null },
    });

    const team = await readyTeam('draft-block');

    for (let index = 0; index < 4; index++) {
      const stage = FIXTURE_STAGES[index];
      const solved = await submit(team.token, stage.slug, stage.answer);
      expect(solved.status).toBe(200);
    }

    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(chain.body.current.stage.slug).toBe('fixture-05');
    expect(chain.body.current.stage.status).toBe('draft');
    expect(chain.body.stages[4].state).toBe('unlocked');
    expect(chain.body.stages[6].state).toBe('locked');

    const blocked = await submit(team.token, 'fixture-05', 'FIXTURE{stage-5-answer}');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('STAGE_NOT_PUBLISHED');

    const later = await submit(team.token, 'fixture-06', FIXTURE_STAGES[5].answer);
    expect(later.status).toBe(403);

    await liveRunningChallenge();

    const main = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${team.token}`);
    expect(main.status).toBe(200);
    expect(main.body.current.access).toBe('locked');
    expect(main.body.current.content).toBeNull();
  });

  it('never exposes answers, digests or the pepper', async () => {
    const team = await readyTeam('leak-check');
    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);
    const detail = await request(app)
      .get('/api/ctf/stages/fixture-01')
      .set('Authorization', `Bearer ${team.token}`);

    for (const body of [chain.body, detail.body]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('FIXTURE{stage-1-answer}');
      expect(serialized).not.toContain('fixture{stage-1-answer}');
      expect(serialized).not.toContain(TEST_PEPPER);
      expect(serialized).not.toMatch(/[0-9a-f]{64}/);
      expect(serialized).not.toContain('answerHash');
    }
  });

  it('returns a null Drive URL without breaking the stage payload', async () => {
    const team = await readyTeam('drive-null');
    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(chain.body.current.stage.assetDriveUrl).toBeNull();
  });

  it('reports a configured Drive URL back to the team', async () => {
    await prisma.ctfStage.update({
      where: { slug: 'fixture-01' },
      data: { assetDriveUrl: 'https://drive.google.com/drive/folders/fixture' },
    });

    const team = await readyTeam('drive-set');
    const chain = await request(app)
      .get('/api/ctf/chain')
      .set('Authorization', `Bearer ${team.token}`);

    expect(chain.body.current.stage.assetDriveUrl).toBe(
      'https://drive.google.com/drive/folders/fixture',
    );
  });
});
