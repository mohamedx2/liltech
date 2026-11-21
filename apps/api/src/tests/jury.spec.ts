import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  adminJuryAccountDetailSchema,
  juryOverviewResponseSchema,
  juryTeamEvaluationResponseSchema,
  juryTeamItemSchema,
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
 * Jury evaluation: assignment to a challenge, the teams a juror scores, the
 * scoring window, per-juror isolation and validation.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'jury-suite-password-2026';
const SCORES = {
  technical_execution: 20,
  innovation_originality: 25,
  ui_ux_design: 15,
  pitch_presentation: 20,
};

describeDb('jury evaluation', () => {
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
      name: 'Jury Admin',
      email: 'jury-admin@test.local',
      passwordHash: await hashPassword(PASSWORD),
    });
    adminUserId = admin.id;
    adminToken = (await createSessionForUser(admin.id)).token;

    const ids: string[] = [];
    for (const position of [1, 2]) {
      const created = await asAdmin(request(app).post('/api/admin/challenges')).send({
        position,
        title: `Challenge ${position}`,
        summary: `Teaser ${position}`,
        description: `Brief ${position}`,
      });
      expect(created.status).toBe(201);
      ids.push(created.body.id as string);
    }
    [challenge1, challenge2] = ids;
  });

  async function setPhase(phase: string) {
    const response = await asAdmin(request(app).post('/api/event-state')).send({
      phase,
      force: true,
    });
    expect(response.status).toBe(200);
  }

  async function createJury(email: string, challengeId: string | null) {
    const response = await asAdmin(request(app).post('/api/admin/jury')).send({
      name: email.split('@')[0],
      email,
      challengeId,
    });
    expect(response.status).toBe(201);
    const account = adminJuryAccountDetailSchema.parse(response.body);
    return { ...account, token: (await createSessionForUser(account.id)).token };
  }

  async function registerTeam(slug: string, { checkedIn = true } = {}) {
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
    if (checkedIn) {
      const leader = await prisma.participant.findFirstOrThrow({
        where: { teamId, isLeader: true },
        select: { id: true },
      });
      await prisma.checkInRecord.create({
        data: { participantId: leader.id, checkedByUserId: adminUserId },
      });
      await prisma.team.update({ where: { id: teamId }, data: { progressState: 'checked_in' } });
    }
    return teamId;
  }

  async function addSubmission(teamId: string, challengeId: string, githubUrl: string) {
    const leader = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { leaderId: true },
    });
    await prisma.submission.create({
      data: { teamId, challengeId, githubUrl, submittedByUserId: leader.leaderId },
    });
  }

  function score(token: string, teamId: string, body: object = { criteriaScores: SCORES }) {
    return request(app).post(`/api/jury/evaluation?teamId=${teamId}`).set(auth(token)).send(body);
  }

  it('assigns a juror to a challenge from the admin jury tools', async () => {
    const jury = await createJury('assigned@jury.test', challenge1);
    expect(jury).toMatchObject({ challengeId: challenge1, challengeTitle: 'Challenge 1' });

    const moved = await asAdmin(request(app).patch(`/api/admin/jury/${jury.id}`)).send({
      challengeId: challenge2,
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ challengeId: challenge2, challengeTitle: 'Challenge 2' });

    const unknown = await asAdmin(request(app).patch(`/api/admin/jury/${jury.id}`)).send({
      challengeId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(400);

    const cleared = await asAdmin(request(app).patch(`/api/admin/jury/${jury.id}`)).send({
      challengeId: null,
    });
    expect(cleared.body).toMatchObject({ challengeId: null, challengeTitle: null });
  });

  it('is jury-only and needs an assigned challenge', async () => {
    expect((await request(app).get('/api/jury/overview')).status).toBe(401);
    expect((await asAdmin(request(app).get('/api/jury/overview'))).status).toBe(403);

    const unassigned = await createJury('unassigned@jury.test', null);
    const response = await request(app).get('/api/jury/overview').set(auth(unassigned.token));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('JURY_NOT_ASSIGNED');
  });

  it('lists every active checked-in team with its submission for my challenge', async () => {
    const present = await registerTeam('present');
    const quiet = await registerTeam('quiet');
    await registerTeam('absent', { checkedIn: false });
    const gone = await registerTeam('gone');
    await prisma.team.update({ where: { id: gone }, data: { status: 'withdrawn' } });
    await addSubmission(present, challenge1, 'https://github.com/demo/present-c1');
    await addSubmission(present, challenge1, 'https://github.com/demo/present-c1-v2');
    await addSubmission(quiet, challenge2, 'https://github.com/demo/quiet-c2');
    const jury = await createJury('track-a@jury.test', challenge1);

    const teams = await request(app).get('/api/jury/teams').set(auth(jury.token));
    expect(teams.status).toBe(200);
    const items = teams.body.map((item: unknown) => juryTeamItemSchema.parse(item));
    expect(items.map((item: { name: string }) => item.name)).toEqual([
      'Team present',
      'Team quiet',
    ]);
    expect(items[0]).toMatchObject({
      track: 'track_a',
      submitted: true,
      submissionRepoUrl: 'https://github.com/demo/present-c1-v2',
      evaluationStatus: 'pending',
      myScore: null,
    });
    // A submission for the other challenge does not count here.
    expect(items[1]).toMatchObject({ submitted: false, submissionRepoUrl: null });

    const detail = await request(app)
      .get(`/api/jury/evaluation?teamId=${present}`)
      .set(auth(jury.token));
    const parsed = juryTeamEvaluationResponseSchema.parse(detail.body);
    expect(parsed.submission).toMatchObject({
      version: 2,
      githubUrl: 'https://github.com/demo/present-c1-v2',
    });
    expect(parsed.members).toHaveLength(4);
    expect(parsed.members[0].roleInTeam).toBe('leader');
    expect(parsed.evaluation).toBeNull();

    const overview = juryOverviewResponseSchema.parse(
      (await request(app).get('/api/jury/overview').set(auth(jury.token))).body,
    );
    expect(overview).toMatchObject({
      track: 'track_a',
      trackTitle: 'Challenge 1',
      totalTeams: 2,
      evaluatedTeams: 0,
      pendingTeams: 2,
      averageScore: null,
    });
  });

  it('opens scoring only while submissions are closed and during the pitches', async () => {
    const teamId = await registerTeam('window');
    const jury = await createJury('window@jury.test', challenge1);

    await setPhase('live');
    const early = await score(jury.token, teamId);
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe('SCORING_CLOSED');

    await setPhase('submissions_closed');
    const saved = await score(jury.token, teamId);
    expect(saved.status).toBe(200);
    // Weighted: 15/25×35 + 25/25×25 + 20/25×25 + 20/25×15 = 21 + 25 + 20 + 12.
    expect(saved.body).toMatchObject({ success: true, totalScore: 78 });

    await setPhase('pitching');
    const updated = await score(jury.token, teamId, {
      criteriaScores: { ...SCORES, pitch_presentation: 25 },
      notes: '  Strong demo.  ',
    });
    expect(updated.body.totalScore).toBe(81);
    expect(await prisma.juryEvaluation.count()).toBe(1);

    const detail = juryTeamEvaluationResponseSchema.parse(
      (await request(app).get(`/api/jury/evaluation?teamId=${teamId}`).set(auth(jury.token))).body,
    );
    expect(detail.evaluation).toMatchObject({ totalScore: 81, notes: 'Strong demo.' });
    expect(detail.team).toMatchObject({ evaluationStatus: 'graded', myScore: 81 });

    await setPhase('results');
    const late = await score(jury.token, teamId);
    expect(late.body.error.code).toBe('SCORING_CLOSED');
  });

  it('keeps each juror to their own scores and their own challenge', async () => {
    const teamId = await registerTeam('shared');
    const first = await createJury('first@jury.test', challenge1);
    const second = await createJury('second@jury.test', challenge1);
    const other = await createJury('other@jury.test', challenge2);
    await setPhase('pitching');

    expect((await score(first.token, teamId)).status).toBe(200);

    const secondView = await request(app)
      .get(`/api/jury/evaluation?teamId=${teamId}`)
      .set(auth(second.token));
    expect(secondView.body.evaluation).toBeNull();
    expect(secondView.body.team.evaluationStatus).toBe('pending');

    const otherView = await request(app)
      .get(`/api/jury/evaluation?teamId=${teamId}`)
      .set(auth(other.token));
    expect(otherView.body.evaluation).toBeNull();
    expect(otherView.body.team.track).toBe('track_b');

    // Scoring the same team on challenge 2 is a separate evaluation.
    expect((await score(other.token, teamId)).status).toBe(200);
    expect(await prisma.juryEvaluation.count({ where: { teamId } })).toBe(2);
  });

  it('refuses invalid scores, unknown fields and teams outside the evaluation', async () => {
    const teamId = await registerTeam('strict');
    const absent = await registerTeam('away', { checkedIn: false });
    const jury = await createJury('strict@jury.test', challenge1);
    await setPhase('pitching');

    for (const body of [
      { criteriaScores: { ...SCORES, ui_ux_design: 26 } },
      { criteriaScores: { ...SCORES, ui_ux_design: 12.5 } },
      { criteriaScores: { ...SCORES, extra: 3 } },
      { criteriaScores: SCORES, teamId },
    ]) {
      expect((await score(jury.token, teamId, body)).status).toBe(400);
    }
    expect((await score(jury.token, absent)).status).toBe(404);
    expect(
      (await request(app).get('/api/jury/evaluation?teamId=not-a-uuid').set(auth(jury.token)))
        .status,
    ).toBe(400);
    expect(await prisma.juryEvaluation.count()).toBe(0);
  });

  it('audits each saved evaluation without the scores, and protects them on delete', async () => {
    const teamId = await registerTeam('audited');
    const jury = await createJury('audited@jury.test', challenge1);
    await setPhase('pitching');
    await score(jury.token, teamId);

    const entries = await prisma.auditLog.findMany({ where: { action: 'jury.evaluation_saved' } });
    expect(entries).toHaveLength(1);
    // Who scored which team and when; the scores themselves stay out of the audit.
    expect(entries[0]).toMatchObject({
      actorId: jury.id,
      targetId: teamId,
      summary: 'Challenge 1 evaluation saved',
    });

    const deleted = await asAdmin(request(app).delete(`/api/admin/jury/${jury.id}`));
    expect(deleted.status).toBe(409);
    expect(await prisma.juryEvaluation.count()).toBe(1);
  });
});
