import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  adminOverviewResponseSchema,
  adminTeamListResponseSchema,
  adminTeamSchema,
  type AdminTeam,
} from 'api-contracts';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { setBadgeMailTransport } from '../modules/badges/badge-mailer';
import { registerTeamWithBadges } from '../modules/registration/registration.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Admin operations toolkit: the fixes organizers apply on event night.
 * Runs against TEST_DATABASE_URL; skips when it is absent.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'operations-password-2026';

describeDb('admin operations', () => {
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
      name: 'Ops Admin',
      email: 'admin@ops.test',
      passwordHash,
    });
    const jury = await createUser({
      role: 'jury',
      name: 'Ops Juror',
      email: 'jury@ops.test',
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

  async function registerTeam(slug: string, memberCount = 3) {
    const registered = await registerTeamWithBadges({
      teamName: `Team ${slug}`,
      leader: {
        name: `${slug} Leader`,
        email: `leader@${slug}.test`,
        password: PASSWORD,
        university: 'Test University',
        phone: '+216 20 123 456',
      },
      members: Array.from({ length: memberCount }, (_, index) => ({
        name: `${slug} Member ${index + 1}`,
        email: `m${index + 1}@${slug}.test`,
        university: 'Test University',
        phone: '+216 20 123 456',
      })),
    });
    const tokens = new Map(registered.badges.map((badge) => [badge.participantName, badge.token]));
    return { ...registered, tokens };
  }

  function parseTeam(body: unknown): AdminTeam {
    return adminTeamSchema.parse(body);
  }

  async function login(email: string, password: string) {
    return request(app).post('/api/auth/login').send({ email, password });
  }

  async function setPhase(phase: string) {
    // Tests jump between phases, which the API treats as an audited override.
    const response = await asAdmin(request(app).post('/api/event-state')).send({
      phase,
      force: true,
    });
    expect(response.status).toBe(200);
  }

  it('lists teams with contact, badge and check-in state', async () => {
    const team = await registerTeam('roster');

    const response = await asAdmin(request(app).get('/api/admin/teams'));
    expect(response.status).toBe(200);
    const roster = adminTeamListResponseSchema.parse(response.body);
    expect(roster.total).toBe(1);

    const [listed] = roster.items;
    expect(listed.id).toBe(team.id);
    expect(listed.status).toBe('active');
    expect(listed.leader.email).toBe('leader@roster.test');
    expect(listed.participants).toHaveLength(4);
    expect(listed.participants[0]).toMatchObject({ isLeader: true, checkedInAt: null });
    expect(listed.participants[0].badge?.revokedAt).toBeNull();
    // Badge tokens are credentials: never part of the roster.
    expect(JSON.stringify(response.body)).not.toContain(team.badges[0].token);
  });

  it('summarizes the event on the overview board', async () => {
    await registerTeam('board');

    const response = await asAdmin(request(app).get('/api/admin/overview'));
    expect(response.status).toBe(200);
    const overview = adminOverviewResponseSchema.parse(response.body);
    expect(overview.phase).toBe('registration');
    expect(overview.teams).toMatchObject({ total: 1, active: 1, notCheckedIn: 1 });
    expect(overview.teams.byProgress.registered).toBe(1);
    expect(overview.participants.total).toBe(4);
    expect(overview.participants.byColor.reduce((sum, group) => sum + group.total, 0)).toBe(4);
  });

  it('checks a participant in manually and undoes it', async () => {
    const team = await registerTeam('manual');
    const member = team.participants.find((participant) => !participant.isLeader);
    expect(member).toBeDefined();
    const participantId = member?.id ?? '';

    const checkedIn = await asAdmin(
      request(app).post(`/api/admin/participants/${participantId}/check-in`),
    );
    expect(checkedIn.status).toBe(200);
    const afterCheckIn = parseTeam(checkedIn.body);
    expect(afterCheckIn.progressState).toBe('checked_in');
    expect(afterCheckIn.participants.find((p) => p.id === participantId)).toMatchObject({
      checkedInByName: 'Ops Admin',
    });

    const again = await asAdmin(
      request(app).post(`/api/admin/participants/${participantId}/check-in`),
    );
    expect(again.status).toBe(409);

    const undone = await asAdmin(
      request(app).delete(`/api/admin/participants/${participantId}/check-in`),
    );
    expect(undone.status).toBe(200);
    const afterUndo = parseTeam(undone.body);
    expect(afterUndo.progressState).toBe('registered');
    expect(afterUndo.participants.every((p) => p.checkedInAt === null)).toBe(true);
  });

  it('marks participants paid or unpaid one by one, audited and idempotent', async () => {
    const team = await registerTeam('fees');
    const [first, second] = team.participants;
    const pay = (participantId: string, paid: boolean) =>
      asAdmin(request(app).put(`/api/admin/participants/${participantId}/payment`)).send({ paid });

    const initial = parseTeam(
      (await asAdmin(request(app).get(`/api/admin/teams/${team.id}`))).body,
    );
    expect(initial.participants.every((p) => p.paidAt === null && p.paidByName === null)).toBe(
      true,
    );

    const marked = await pay(first.id, true);
    expect(marked.status).toBe(200);
    const afterMark = parseTeam(marked.body);
    expect(afterMark.participants.find((p) => p.id === first.id)).toMatchObject({
      paidByName: 'Ops Admin',
    });
    expect(afterMark.participants.find((p) => p.id === first.id)?.paidAt).not.toBeNull();
    // One by one: the teammate is untouched.
    expect(afterMark.participants.find((p) => p.id === second.id)?.paidAt).toBeNull();

    // Setting the same state again is a no-op, with no second audit entry.
    expect((await pay(first.id, true)).status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { action: 'participant.payment_marked', targetId: first.id },
      }),
    ).toBe(1);

    const cleared = await pay(first.id, false);
    expect(cleared.status).toBe(200);
    expect(parseTeam(cleared.body).participants.find((p) => p.id === first.id)).toMatchObject({
      paidAt: null,
      paidByName: null,
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'participant.payment_cleared', targetId: first.id },
      }),
    ).toBe(1);
  });

  it('guards the payment endpoint: admin only, strict body, known participant', async () => {
    const team = await registerTeam('fee-guard');
    const participantId = team.participants[0].id;
    const url = `/api/admin/participants/${participantId}/payment`;

    expect((await request(app).put(url).send({ paid: true })).status).toBe(401);
    expect((await asAdmin(request(app).put(url)).send({ paid: 'yes' })).status).toBe(400);
    expect((await asAdmin(request(app).put(url)).send({ paid: true, amount: 10 })).status).toBe(
      400,
    );
    const unknown = await asAdmin(
      request(app).put('/api/admin/participants/00000000-0000-4000-8000-000000000000/payment'),
    ).send({ paid: true });
    expect(unknown.status).toBe(404);
  });

  it('keeps a later progress state when a late member is scanned in', async () => {
    const team = await registerTeam('late');
    await prisma.team.update({ where: { id: team.id }, data: { progressState: 'ctf_solved' } });

    const scan = await asAdmin(request(app).post('/api/checkin/scan')).send({
      token: team.badges[1].token,
    });
    expect(scan.status).toBe(200);

    const stored = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(stored.progressState).toBe('ctf_solved');
  });

  it('reissues a badge so the old QR code stops working', async () => {
    const team = await registerTeam('reissue');
    const badge = team.badges[1];

    const reissued = await asAdmin(
      request(app).post(`/api/admin/participants/${badge.participantId}/reissue-badge`),
    );
    expect(reissued.status).toBe(200);
    expect(reissued.body).toMatchObject({ participantId: badge.participantId, emailQueued: true });

    const oldScan = await asAdmin(request(app).post('/api/checkin/scan')).send({
      token: badge.token,
    });
    expect(oldScan.status).toBe(404);
  });

  it('reissues a revoked badge so it works again', async () => {
    const team = await registerTeam('unrevoke');
    const badge = team.badges[1];
    await asAdmin(request(app).post('/api/checkin/revoke')).send({
      participantId: badge.participantId,
    });

    const reissued = await asAdmin(
      request(app).post(`/api/admin/participants/${badge.participantId}/reissue-badge`),
    );
    expect(reissued.status).toBe(200);

    const roster = parseTeam((await asAdmin(request(app).get(`/api/admin/teams/${team.id}`))).body);
    expect(
      roster.participants.find((p) => p.id === badge.participantId)?.badge?.revokedAt,
    ).toBeNull();
  });

  it('fixes a participant email and changes the login when it is the leader', async () => {
    const team = await registerTeam('typo');
    const leader = team.participants.find((participant) => participant.isLeader);

    const updated = await asAdmin(request(app).patch(`/api/admin/participants/${leader?.id}`)).send(
      {
        email: 'Fixed-Leader@typo.test',
      },
    );
    expect(updated.status).toBe(200);
    expect(parseTeam(updated.body).leader.email).toBe('fixed-leader@typo.test');

    expect((await login('fixed-leader@typo.test', PASSWORD)).status).toBe(200);
    expect((await login('leader@typo.test', PASSWORD)).status).toBe(401);
  });

  it('refuses an email that is already registered on another team', async () => {
    const first = await registerTeam('dup-a');
    await registerTeam('dup-b');
    const member = first.participants.find((participant) => !participant.isLeader);

    const response = await asAdmin(
      request(app).patch(`/api/admin/participants/${member?.id}`),
    ).send({
      email: 'm1@dup-b.test',
    });
    expect(response.status).toBe(409);
  });

  it('adds members up to the maximum team size', async () => {
    const team = await registerTeam('grow', 5);

    const added = await asAdmin(request(app).post(`/api/admin/teams/${team.id}/participants`)).send(
      {
        name: 'Late Joiner',
        email: 'late@grow.test',
        university: 'Test University',
        phone: '+216 20 123 456',
      },
    );
    expect(added.status).toBe(201);
    const grown = parseTeam(added.body);
    expect(grown.participants).toHaveLength(7);
    expect(grown.participants.find((p) => p.name === 'Late Joiner')?.badge).not.toBeNull();

    const tooMany = await asAdmin(
      request(app).post(`/api/admin/teams/${team.id}/participants`),
    ).send({
      name: 'One Too Many',
      email: 'extra@grow.test',
      university: 'Test University',
      phone: '+216 20 123 456',
    });
    expect(tooMany.status).toBe(409);
  });

  it('removes a member but never the leader', async () => {
    const team = await registerTeam('shrink');
    const leader = team.participants.find((participant) => participant.isLeader);
    const member = team.participants.find((participant) => !participant.isLeader);

    expect(
      (await asAdmin(request(app).delete(`/api/admin/participants/${leader?.id}`))).status,
    ).toBe(409);

    const removed = await asAdmin(request(app).delete(`/api/admin/participants/${member?.id}`));
    expect(removed.status).toBe(200);
    expect(parseTeam(removed.body).participants).toHaveLength(3);
  });

  it('resets the team password and signs out open sessions', async () => {
    const team = await registerTeam('locked');
    const session = await login('leader@locked.test', PASSWORD);
    expect(session.status).toBe(200);
    const oldToken = session.body.token as string;

    const reset = await asAdmin(request(app).post(`/api/admin/teams/${team.id}/reset-password`));
    expect(reset.status).toBe(200);
    expect(reset.body.revokedSessions).toBe(1);

    const meWithOldToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(meWithOldToken.status).toBe(401);
    expect((await login('leader@locked.test', PASSWORD)).status).toBe(401);
    expect((await login('leader@locked.test', reset.body.temporaryPassword)).status).toBe(200);
  });

  it('blocks check-in and challenge access for a disqualified team, and restores it', async () => {
    const team = await registerTeam('dq');

    const missingReason = await asAdmin(
      request(app).post(`/api/admin/teams/${team.id}/status`),
    ).send({
      status: 'disqualified',
    });
    expect(missingReason.status).toBe(400);

    const disqualified = await asAdmin(
      request(app).post(`/api/admin/teams/${team.id}/status`),
    ).send({
      status: 'disqualified',
      reason: 'Plagiarized submission',
    });
    expect(disqualified.status).toBe(200);
    expect(parseTeam(disqualified.body)).toMatchObject({
      status: 'disqualified',
      statusReason: 'Plagiarized submission',
    });

    const scan = await asAdmin(request(app).post('/api/checkin/scan')).send({
      token: team.badges[0].token,
    });
    expect(scan.status).toBe(403);

    await setPhase('live');
    const teamSession = await login('leader@dq.test', PASSWORD);
    const challenges = await request(app)
      .get('/api/challenges')
      .set('Authorization', `Bearer ${teamSession.body.token}`);
    expect(challenges.status).toBe(403);

    const restored = await asAdmin(request(app).post(`/api/admin/teams/${team.id}/status`)).send({
      status: 'active',
    });
    expect(parseTeam(restored.body)).toMatchObject({ status: 'active', statusReason: null });
  });

  it('deletes a team before the event goes live only', async () => {
    const keep = await registerTeam('keep');
    const spam = await registerTeam('spam');

    const deleted = await asAdmin(request(app).delete(`/api/admin/teams/${spam.id}`));
    expect(deleted.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { email: 'leader@spam.test' } })).toBeNull();

    await setPhase('live');
    const tooLate = await asAdmin(request(app).delete(`/api/admin/teams/${keep.id}`));
    expect(tooLate.status).toBe(409);
  });

  it('grants and revokes Mini-CTF early access', async () => {
    const team = await registerTeam('ctf');
    const challenge = await asAdmin(request(app).post('/api/admin/challenges')).send({
      position: 1,
      title: 'Challenge One',
      description: 'Description',
    });
    expect(challenge.status).toBe(201);

    const granted = await asAdmin(request(app).post(`/api/admin/teams/${team.id}/ctf-solves`)).send(
      {
        challengeId: challenge.body.id,
      },
    );
    expect(granted.status).toBe(201);
    expect(parseTeam(granted.body).ctfSolves).toHaveLength(1);

    const duplicate = await asAdmin(
      request(app).post(`/api/admin/teams/${team.id}/ctf-solves`),
    ).send({ challengeId: challenge.body.id });
    expect(duplicate.status).toBe(409);

    const revoked = await asAdmin(
      request(app).delete(`/api/admin/teams/${team.id}/ctf-solves/${challenge.body.id}`),
    );
    expect(revoked.status).toBe(200);
    expect(parseTeam(revoked.body).ctfSolves).toHaveLength(0);
  });

  it('requeues failed badge emails in bulk', async () => {
    const team = await registerTeam('mail');
    await prisma.qrToken.updateMany({
      where: { participantId: { in: team.participants.map((participant) => participant.id) } },
      data: { emailStatus: 'failed' },
    });

    const response = await asAdmin(request(app).post('/api/admin/badges/resend-failed'));
    expect(response.status).toBe(200);
    expect(response.body.queued).toBe(4);
  });

  it('deletes a wrong announcement', async () => {
    const published = await asAdmin(request(app).post('/api/announcements')).send({
      body: 'Dinner is at 19:00 (wrong)',
    });
    expect(published.status).toBe(201);

    const deleted = await asAdmin(request(app).delete(`/api/announcements/${published.body.id}`));
    expect(deleted.status).toBe(204);
    const again = await asAdmin(request(app).delete(`/api/announcements/${published.body.id}`));
    expect(again.status).toBe(404);
  });

  it('records every operation in the audit log, filterable by action', async () => {
    const team = await registerTeam('audit');
    await asAdmin(request(app).patch(`/api/admin/teams/${team.id}`)).send({ name: 'Team Renamed' });

    const response = await asAdmin(request(app).get('/api/admin/audit-log?action=team.'));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      action: 'team.renamed',
      actorName: 'Ops Admin',
      targetType: 'team',
      targetId: team.id,
    });
  });

  it('keeps every operation admin-only', async () => {
    const team = await registerTeam('rbac');
    const calls = [
      request(app).get('/api/admin/overview'),
      request(app).post(`/api/admin/teams/${team.id}/reset-password`),
      request(app).post(`/api/admin/participants/${team.participants[0].id}/check-in`),
      request(app).post('/api/admin/badges/resend-failed'),
    ];
    for (const call of calls) {
      const response = await call.set('Authorization', `Bearer ${juryToken}`);
      expect(response.status).toBe(403);
    }
  });
});
