import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../app';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { hashPassword } from '../modules/auth/password.service';
import { hashAnswer } from '../modules/ctf/ctf-answer';
import { setGithubCommitFetcher } from '../modules/submissions/github-commit';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Participant challenge flow: phase gating, the Mini-CTF clock, Challenge 01
 * fallback/force-open and the link submissions.
 *
 * The flags below are test-only fixtures; real event flags never appear in this
 * repository.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'participant-password-2026';
const MINUTE = 60_000;

const STAGES = [1, 2, 3].map((position) => ({
  slug: `pc-0${position}`,
  position,
  title: `Fixture stage ${position}`,
  answer: `FIXTURE{participant-${position}}`,
}));

describeDb('participant challenges', () => {
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

  afterEach(() => {
    setGithubCommitFetcher(undefined);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();

    const admin = await createUser({
      role: 'admin',
      name: 'Challenge Admin',
      email: 'pc-admin@test.local',
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
          requiredForUnlock: true,
          hints: { create: [{ position: 1, body: `Hint for ${stage.slug}` }] },
        },
      });
    }
  });

  const asAdmin = (call: request.Test) => call.set('Authorization', `Bearer ${adminToken}`);

  async function setPhase(phase: string, ctfStartedAt: Date | null = null) {
    const response = await asAdmin(request(app).post('/api/event-state')).send({
      phase,
      force: true,
    });
    expect(response.status).toBe(200);

    if (ctfStartedAt !== null) {
      await prisma.eventPhaseState.update({ where: { id: 1 }, data: { ctfStartedAt } });
    }

    return response.body as { phase: string; ctfStartedAt: string | null };
  }

  async function registerTeam(slug: string): Promise<{ teamId: string; token: string }> {
    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: `PC ${slug}`,
        leader: {
          name: 'PC Leader',
          email: `leader@pc-${slug}.test`,
          password: PASSWORD,
          university: 'Test University',
          phone: '+216 20 123 456',
        },
        members: [1, 2, 3].map((n) => ({
          name: `PC ${slug} ${n}`,
          email: `m${n}@pc-${slug}.test`,
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
    const session = await createSessionForUser(team.leaderId);
    return { teamId, token: session.token };
  }

  /** Check-in without registration: registration closes once the event is live. */
  async function checkInTeam<Team extends { teamId: string }>(team: Team): Promise<Team> {
    const leader = await prisma.participant.findFirstOrThrow({
      where: { teamId: team.teamId, isLeader: true },
      select: { id: true },
    });
    await prisma.checkInRecord.create({
      data: { participantId: leader.id, checkedByUserId: adminUserId },
    });
    await prisma.team.update({
      where: { id: team.teamId },
      data: { progressState: 'checked_in' },
    });
    return team;
  }

  async function checkedInTeam(slug: string) {
    return checkInTeam(await registerTeam(slug));
  }

  async function createChallenge(position: number, extra: Record<string, unknown> = {}) {
    const response = await asAdmin(request(app).post('/api/admin/challenges')).send({
      position,
      title: `Challenge ${position}`,
      summary: `Teaser ${position}`,
      description: `Full description ${position}`,
      problemStatement: `Problem ${position}`,
      deliverables: ['A repository'],
      resources: [],
      publicDelayMinutes: 600,
      ...extra,
    });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function chain(token: string) {
    return request(app).get('/api/ctf/chain').set(auth(token));
  }

  function submit(token: string, slug: string, answer: string) {
    return request(app).post(`/api/ctf/stages/${slug}/submit`).set(auth(token)).send({ answer });
  }

  async function submitWholeChain(token: string) {
    for (const stage of STAGES) {
      const response = await submit(token, stage.slug, stage.answer);
      expect(response.status).toBe(200);
    }
  }

  describe('phase matrix', () => {
    it('refuses stage 1, hints and flags before the CTF is launched', async () => {
      const team = await checkedInTeam('not-launched');
      await setPhase('checkin');

      const tracker = await chain(team.token);
      expect(tracker.status).toBe(200);
      expect(tracker.body.timing).toMatchObject({ startedAt: null, open: false, closed: false });
      expect(tracker.body.current).toBeNull();
      expect(
        tracker.body.stages.every((stage: { state: string }) => stage.state === 'locked'),
      ).toBe(true);

      const detail = await request(app)
        .get(`/api/ctf/stages/${STAGES[0].slug}`)
        .set(auth(team.token));
      expect(detail.status).toBe(403);
      expect(detail.body.error.code).toBe('CTF_NOT_OPEN');

      const hints = await request(app)
        .post(`/api/ctf/stages/${STAGES[0].slug}/hints`)
        .set(auth(team.token));
      expect(hints.status).toBe(403);
      expect(hints.body.error.code).toBe('CTF_NOT_OPEN');

      const flag = await submit(team.token, STAGES[0].slug, STAGES[0].answer);
      expect(flag.status).toBe(403);
      expect(flag.body.error.code).toBe('CTF_NOT_OPEN');
    });

    it('refuses the CTF before the launch even for a team checked in long before', async () => {
      const team = await checkedInTeam('early-scan');
      await setPhase('registration');
      expect((await chain(team.token)).body.eligible).toBe(true);
      expect((await chain(team.token)).body.current).toBeNull();
    });

    it('opens the CTF once the event is live and records the launch instant', async () => {
      const team = await checkedInTeam('live');
      const state = await setPhase('live');

      expect(state.ctfStartedAt).not.toBeNull();

      const tracker = await chain(team.token);
      expect(tracker.body.timing.open).toBe(true);
      expect(tracker.body.timing.closesAt).toBe(
        new Date(new Date(tracker.body.timing.startedAt).getTime() + 60 * MINUTE).toISOString(),
      );
      expect(tracker.body.current.stage.slug).toBe(STAGES[0].slug);
    });

    it('refuses every CTF action once submissions are closed', async () => {
      const team = await checkedInTeam('closed-phase');
      await setPhase('live');
      const solved = await submit(team.token, STAGES[0].slug, STAGES[0].answer);
      expect(solved.status).toBe(200);

      await setPhase('submissions_closed');

      const tracker = await chain(team.token);
      expect(tracker.body.timing).toMatchObject({ open: false, closed: true });
      expect(tracker.body.current).toBeNull();

      const detail = await request(app)
        .get(`/api/ctf/stages/${STAGES[1].slug}`)
        .set(auth(team.token));
      expect(detail.status).toBe(403);
      expect(detail.body.error.code).toBe('CTF_CLOSED');

      const flag = await submit(team.token, STAGES[1].slug, STAGES[1].answer);
      expect(flag.status).toBe(403);
      expect(flag.body.error.code).toBe('CTF_CLOSED');

      const replay = await submit(team.token, STAGES[0].slug, STAGES[0].answer);
      expect(replay.status).toBe(403);
    });

    it.each(['submissions_closed', 'pitching', 'results'])(
      'refuses CTF flags in the %s phase',
      async (phase) => {
        // Underscores are not valid in an email domain; the slug is cosmetic.
        const team = await checkedInTeam(`phase-${phase.replace(/_/g, '-')}`);
        await setPhase('live');
        await setPhase(phase);

        const response = await submit(team.token, STAGES[0].slug, STAGES[0].answer);
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('CTF_CLOSED');
      },
    );

    it.each(['registration', 'checkin'])('refuses submissions in the %s phase', async (phase) => {
      const team = await checkedInTeam(`submit-${phase.replace(/_/g, '-')}`);
      await createChallenge(1);
      await setPhase(phase);

      const overview = await request(app).get('/api/submissions').set(auth(team.token));
      expect(overview.status).toBe(200);
      expect(overview.body.items[0]).toMatchObject({
        canSubmit: false,
        blockedReason: 'EVENT_NOT_LIVE',
      });

      const created = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/abc/view' });
      expect(created.status).toBe(403);
      expect(created.body.error.code).toBe('SUBMISSIONS_CLOSED');
    });

    it.each(['submissions_closed', 'pitching', 'results'])(
      'refuses submissions in the %s phase',
      async (phase) => {
        const team = await checkedInTeam(`late-${phase.replace(/_/g, '-')}`);
        await setPhase('live');
        const challenge = await createChallenge(1);
        await asAdmin(request(app).post(`/api/admin/challenges/${challenge.id}/start`));
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { publicAt: new Date(Date.now() - MINUTE) },
        });
        await setPhase(phase);

        const created = await request(app)
          .post('/api/submissions')
          .set(auth(team.token))
          .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/abc/view' });
        expect(created.status).toBe(403);
        expect(created.body.error.code).toBe('SUBMISSIONS_CLOSED');
      },
    );
  });

  describe('mini-ctf clock and scoring', () => {
    it('closes flag submissions exactly 60 minutes after the launch', async () => {
      const team = await checkedInTeam('window');
      await setPhase('live');
      await prisma.eventPhaseState.update({
        where: { id: 1 },
        data: { ctfStartedAt: new Date(Date.now() - 60 * MINUTE) },
      });

      const tracker = await chain(team.token);
      expect(tracker.body.timing).toMatchObject({ open: false, closed: true });

      const response = await submit(team.token, STAGES[0].slug, STAGES[0].answer);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CTF_CLOSED');
    });

    it('stores the solve instant and the automatic points for the solve window', async () => {
      const team = await checkedInTeam('scored');
      await setPhase('live');
      await prisma.eventPhaseState.update({
        where: { id: 1 },
        data: { ctfStartedAt: new Date(Date.now() - 16 * MINUTE) },
      });

      let last: request.Response | undefined;
      for (const stage of STAGES) {
        last = await submit(team.token, stage.slug, stage.answer);
        expect(last.status).toBe(200);
      }

      expect(last?.body).toMatchObject({ completedChain: true, points: 7 });

      const stored = await prisma.team.findUniqueOrThrow({ where: { id: team.teamId } });
      expect(stored.ctfPoints).toBe(7);
      expect(stored.ctfSolvedAt).not.toBeNull();
      expect(stored.progressState).toBe('challenge_unlocked');

      const tracker = await chain(team.token);
      expect(tracker.body.team).toMatchObject({ points: 7 });
    });

    it('is idempotent: a second correct final flag changes neither points nor solve time', async () => {
      const team = await checkedInTeam('idempotent');
      await setPhase('live');
      await submitWholeChain(team.token);

      const first = await prisma.team.findUniqueOrThrow({ where: { id: team.teamId } });

      const replay = await submit(
        team.token,
        STAGES[STAGES.length - 1].slug,
        STAGES.at(-1)!.answer,
      );
      expect(replay.status).toBe(200);
      expect(replay.body.message).toContain('already solved');

      const second = await prisma.team.findUniqueOrThrow({ where: { id: team.teamId } });
      expect(second.ctfSolvedAt).toEqual(first.ctfSolvedAt);
      expect(second.ctfPoints).toBe(first.ctfPoints);
    });

    it('never stores the plaintext answer in the attempt log', async () => {
      const team = await checkedInTeam('no-plaintext');
      await setPhase('live');
      await submit(team.token, STAGES[0].slug, 'FIXTURE{wrong-guess-value}');

      const attempts = await prisma.ctfAttempt.findMany({ where: { teamId: team.teamId } });
      expect(attempts).toHaveLength(1);
      expect(JSON.stringify(attempts)).not.toContain('wrong-guess-value');
      expect(JSON.stringify(attempts)).not.toContain(STAGES[0].answer);
    });

    it('keeps two teams independent', async () => {
      const first = await checkedInTeam('independent-a');
      const second = await checkedInTeam('independent-b');
      await setPhase('live');

      await submitWholeChain(first.token);

      const other = await chain(second.token);
      expect(other.body.summary.solved).toBe(0);
      expect(other.body.current.stage.slug).toBe(STAGES[0].slug);
      expect(other.body.team.points).toBeNull();
    });
  });

  describe('challenge 01 unlock', () => {
    it('unlocks at exactly ctf_started_at + 60 minutes for an unsolved team', async () => {
      const team = await checkedInTeam('fallback');
      await setPhase('live');
      const challenge = await createChallenge(1);
      await asAdmin(request(app).post(`/api/admin/challenges/${challenge.id}/start`));

      // 59:59 after launch: still locked.
      await prisma.eventPhaseState.update({
        where: { id: 1 },
        data: { ctfStartedAt: new Date(Date.now() - (60 * MINUTE - 1000)) },
      });
      const before = await request(app).get('/api/challenges/current').set(auth(team.token));
      expect(before.body.current.access).toBe('locked');
      expect(before.body.current.unlocksAt).not.toBeNull();

      // Exactly 60:00 after launch: open to everyone.
      await prisma.eventPhaseState.update({
        where: { id: 1 },
        data: { ctfStartedAt: new Date(Date.now() - 60 * MINUTE) },
      });
      const at = await request(app).get('/api/challenges/current').set(auth(team.token));
      expect(at.body.current.access).toBe('public');
      expect(at.body.current.content).not.toBeNull();
      expect(at.body.current.submissionOpen).toBe(true);

      const overview = await request(app).get('/api/submissions').set(auth(team.token));
      expect(overview.body.items[0]).toMatchObject({ canSubmit: true, blockedReason: null });
    });

    it('unlocks immediately for a team that solved the chain', async () => {
      const team = await checkedInTeam('solver');
      await setPhase('live');
      const challenge = await createChallenge(1);
      await asAdmin(request(app).post(`/api/admin/challenges/${challenge.id}/start`));
      await submitWholeChain(team.token);

      const current = await request(app).get('/api/challenges/current').set(auth(team.token));
      expect(current.body.current).toMatchObject({ access: 'early', submissionOpen: true });
    });

    it('opens on an administrative force-open', async () => {
      const team = await checkedInTeam('forced');
      await setPhase('live');
      const challenge = await createChallenge(1);
      await asAdmin(request(app).post(`/api/admin/challenges/${challenge.id}/start`));

      const before = await request(app).get('/api/challenges/current').set(auth(team.token));
      expect(before.body.current.access).toBe('locked');

      const opened = await asAdmin(
        request(app).post(`/api/admin/challenges/${challenge.id}/force-open`),
      );
      expect(opened.status).toBe(200);
      expect(opened.body.forceOpenedAt).not.toBeNull();

      const after = await request(app).get('/api/challenges/current').set(auth(team.token));
      expect(after.body.current).toMatchObject({ access: 'public', forcedOpen: true });
    });

    it('opens challenge 02 to everyone when administrators start it', async () => {
      const team = await checkedInTeam('second');
      await setPhase('live');
      const first = await createChallenge(1);
      const second = await createChallenge(2);

      const before = await request(app).get('/api/challenges').set(auth(team.token));
      expect(before.body.items[1].access).toBe('locked');

      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/start`));
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`));

      const after = await request(app).get('/api/challenges').set(auth(team.token));
      expect(after.body.items[1]).toMatchObject({ access: 'public', submissionOpen: true });
    });
  });

  describe('submissions', () => {
    async function readyChallengeOne() {
      const team = await checkedInTeam(`sub-${Math.random().toString(36).slice(2, 8)}`);
      await setPhase('live');
      const challenge = await createChallenge(1);
      await asAdmin(request(app).post(`/api/admin/challenges/${challenge.id}/start`));
      await prisma.eventPhaseState.update({
        where: { id: 1 },
        data: { ctfStartedAt: new Date(Date.now() - 61 * MINUTE) },
      });
      return { team, challenge };
    }

    it('accepts a Drive link, then keeps every resubmission in an append-only history', async () => {
      const { team } = await readyChallengeOne();

      const first = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/first/view' });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        challengePosition: 1,
        driveUrl: 'https://drive.google.com/file/d/first/view',
        isCurrent: true,
      });

      const second = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://docs.google.com/document/d/second/edit' });
      expect(second.status).toBe(201);

      const overview = await request(app).get('/api/submissions').set(auth(team.token));
      const state = overview.body.items[0];
      expect(state.canSubmit).toBe(true);
      expect(state.current.driveUrl).toBe('https://docs.google.com/document/d/second/edit');
      expect(state.history).toHaveLength(2);
      expect(state.history.filter((item: { isCurrent: boolean }) => item.isCurrent)).toHaveLength(
        1,
      );
      expect(state.history[0].id).toBe(second.body.id);

      expect(await prisma.submission.count({ where: { teamId: team.teamId } })).toBe(2);
    });

    it.each([
      ['http://drive.google.com/file/d/x', 'insecure'],
      ['https://drive.google.com.evil.test/file/d/x', 'wrong host'],
      ['https://user:pass@drive.google.com/file/d/x', 'credentials'],
      ['https://example.com/file/d/x', 'not Drive'],
      ['https://github.com/owner/repo', 'GitHub for challenge 01'],
    ])('rejects the invalid challenge 01 link %s (%s)', async (driveUrl) => {
      const { team } = await readyChallengeOne();

      const response = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.submission.count()).toBe(0);
    });

    it('accepts challenge 02 links and pins the GitHub HEAD when the API answers', async () => {
      const { team, challenge: first } = await readyChallengeOne();
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      const second = await createChallenge(2);
      await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`));

      setGithubCommitFetcher(async (repository) => {
        expect(repository).toEqual({ owner: 'liltech', repo: 'project' });
        return 'a'.repeat(40);
      });

      const response = await request(app).post('/api/submissions').set(auth(team.token)).send({
        challengePosition: 2,
        githubUrl: 'https://github.com/liltech/project',
        reportUrl: 'https://drive.google.com/file/d/report/view',
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        challengePosition: 2,
        githubUrl: 'https://github.com/liltech/project',
        commitSha: 'a'.repeat(40),
      });
    });

    it('accepts challenge 02 with only the repository and the presentation', async () => {
      const { team, challenge: first } = await readyChallengeOne();
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      const second = await createChallenge(2);
      await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`));

      setGithubCommitFetcher(async () => 'b'.repeat(40));

      const response = await request(app).post('/api/submissions').set(auth(team.token)).send({
        challengePosition: 2,
        githubUrl: 'https://github.com/liltech/project',
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        challengePosition: 2,
        githubUrl: 'https://github.com/liltech/project',
        reportUrl: null,
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
      });
    });

    it('still accepts challenge 02 when the GitHub API fails', async () => {
      const { team, challenge: first } = await readyChallengeOne();
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      const second = await createChallenge(2);
      await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`));

      setGithubCommitFetcher(async () => {
        throw new Error('GitHub API unavailable');
      });

      const response = await request(app).post('/api/submissions').set(auth(team.token)).send({
        challengePosition: 2,
        githubUrl: 'https://github.com/liltech/project',
        reportUrl: 'https://drive.google.com/file/d/report/view',
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
      });

      expect(response.status).toBe(201);
      expect(response.body.commitSha).toBeNull();
    });

    it.each([
      'https://github.com/owner',
      'https://gitlab.com/owner/repo',
      'https://github.com/owner/repo?tab=readme',
      'http://github.com/owner/repo',
    ])('rejects the invalid challenge 02 repository %s', async (githubUrl) => {
      const { team, challenge: first } = await readyChallengeOne();
      await asAdmin(request(app).post(`/api/admin/challenges/${first.id}/end`));
      const second = await createChallenge(2);
      await asAdmin(request(app).post(`/api/admin/challenges/${second.id}/start`));

      const response = await request(app).post('/api/submissions').set(auth(team.token)).send({
        challengePosition: 2,
        githubUrl,
        reportUrl: 'https://drive.google.com/file/d/report/view',
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it("refuses another team's challenge 02 before administrators open it", async () => {
      const team = await checkedInTeam('c02-closed');
      await setPhase('live');
      await createChallenge(2);

      const response = await request(app).post('/api/submissions').set(auth(team.token)).send({
        challengePosition: 2,
        githubUrl: 'https://github.com/liltech/project',
        reportUrl: 'https://drive.google.com/file/d/report/view',
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CHALLENGE_LOCKED');
      expect(await prisma.submission.count()).toBe(0);
    });

    it('enforces the organizer deadline and reports it on the overview', async () => {
      const { team } = await readyChallengeOne();

      await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/on-time/view' })
        .then((response) => expect(response.status).toBe(201));

      const challenge = await prisma.challenge.findFirstOrThrow({ where: { position: 1 } });
      await prisma.challenge.update({
        where: { id: challenge.id },
        data: { submissionDeadline: new Date(Date.now() - 1000) },
      });

      const late = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/late/view' });
      expect(late.status).toBe(403);
      expect(late.body.error.code).toBe('SUBMISSIONS_CLOSED');
      expect(late.body.error.message).toContain('deadline');

      const overview = await request(app).get('/api/submissions').set(auth(team.token));
      expect(overview.body.items[0]).toMatchObject({
        canSubmit: false,
        blockedReason: 'DEADLINE_PASSED',
      });
      expect(await prisma.submission.count({ where: { teamId: team.teamId } })).toBe(1);
    });

    it('never shows one team the submissions of another', async () => {
      // Register both teams before the live phase closes registration.
      const second = await registerTeam('sub-spy');
      const first = await readyChallengeOne();
      await checkInTeam(second);

      await request(app)
        .post('/api/submissions')
        .set(auth(first.team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/private/view' })
        .then((response) => expect(response.status).toBe(201));

      const overview = await request(app).get('/api/submissions').set(auth(second.token));
      expect(overview.status).toBe(200);
      expect(overview.body.items[0].history).toHaveLength(0);
      expect(overview.body.items[0].current).toBeNull();
      expect(JSON.stringify(overview.body)).not.toContain('private');
    });

    it('is team-only and rejects unauthenticated or foreign input', async () => {
      const { team } = await readyChallengeOne();

      expect((await request(app).get('/api/submissions')).status).toBe(401);
      expect(
        (
          await request(app)
            .post('/api/submissions')
            .set(auth(team.token))
            .send({ challengePosition: 3, driveUrl: 'https://drive.google.com/file/d/x/view' })
        ).status,
      ).toBe(400);

      const jury = await createUser({
        role: 'jury',
        name: 'Juror',
        email: 'sub-jury@test.local',
        passwordHash: await hashPassword(PASSWORD),
      });
      const juryToken = (await createSessionForUser(jury.id)).token;
      const response = await request(app).get('/api/submissions').set(auth(juryToken));
      expect(response.status).toBe(403);
    });

    it('refuses submissions from a team with nobody checked in', async () => {
      const team = await registerTeam('sub-absent');
      await setPhase('live');
      const challenge = await createChallenge(1);
      await asAdmin(request(app).post(`/api/admin/challenges/${challenge.id}/start`));
      await prisma.eventPhaseState.update({
        where: { id: 1 },
        data: { ctfStartedAt: new Date(Date.now() - 61 * MINUTE) },
      });

      const overview = await request(app).get('/api/submissions').set(auth(team.token));
      expect(overview.status).toBe(403);

      const created = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/x/view' });
      expect(created.status).toBe(403);
      expect(await prisma.submission.count()).toBe(0);
    });

    it('advances the team to `submitted` on the first submission', async () => {
      const { team } = await readyChallengeOne();
      await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/done/view' })
        .then((response) => expect(response.status).toBe(201));

      const stored = await prisma.team.findUniqueOrThrow({ where: { id: team.teamId } });
      expect(stored.progressState).toBe('submitted');
    });

    it('does not count a fallback Challenge 01 submission as a Mini-CTF solve', async () => {
      // `readyChallengeOne` opens Challenge 01 through the 60-minute fallback;
      // the team never submitted a Mini-CTF flag.
      const { team } = await readyChallengeOne();

      const submitted = await request(app)
        .post('/api/submissions')
        .set(auth(team.token))
        .send({ challengePosition: 1, driveUrl: 'https://drive.google.com/file/d/fallback/view' });
      expect(submitted.status).toBe(201);

      const stored = await prisma.team.findUniqueOrThrow({ where: { id: team.teamId } });
      expect(stored.progressState).toBe('submitted');
      expect(stored.ctfSolvedAt).toBeNull();
      expect(stored.ctfPoints).toBeNull();

      const challenges = await request(app).get('/api/challenges').set(auth(team.token));
      expect(challenges.body.items[0]).toMatchObject({ access: 'public', ctfSolved: false });

      const overview = await request(app).get('/api/submissions').set(auth(team.token));
      expect(overview.body.items[0]).toMatchObject({ access: 'public', canSubmit: true });

      // The Mini-CTF itself is still untouched for this team.
      const ctf = await request(app).get('/api/ctf/chain').set(auth(team.token));
      expect(ctf.status).toBe(200);
      expect(ctf.body.team).toMatchObject({ points: null, solvedAt: null });
      expect(ctf.body.summary.solved).toBe(0);
    });
  });
});
