import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  BADGE_EMAIL_RESEND_INTERVAL_MS,
  checkInResponseSchema,
  teamBadgesResponseSchema,
  teamPortalSummarySchema,
  teamRegistrationResponseSchema,
} from 'api-contracts';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { assignBalancedColors } from '../modules/registration/registration.service';
import { waitForScheduledBadgeEmails } from '../modules/badges/badges.service';
import {
  setBadgeMailTransport,
  type BadgeMailMessage,
  type BadgeMailTransport,
} from '../modules/badges/badge-mailer';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Team portal, badge email delivery, badge colors and admin jury management.
 *
 * Security focus: every team endpoint is scoped to the caller's own team
 * (another team's participant answers 404), admin endpoints refuse team and
 * jury tokens, and the hourly resend limit cannot be bypassed by a team.
 *
 * Runs against the isolated test database (TEST_DATABASE_URL); skips when it
 * is absent. Emails go to an in-memory transport, never to SMTP.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'team-password-2026';

class MemoryTransport implements BadgeMailTransport {
  readonly sent: BadgeMailMessage[] = [];
  failNext = false;

  async sendMail(message: BadgeMailMessage): Promise<unknown> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('smtp down');
    }
    this.sent.push(message);
    return { messageId: String(this.sent.length) };
  }
}

describe('assignBalancedColors', () => {
  it('always takes the least used color, so groups never differ by more than one', () => {
    expect(assignBalancedColors({}, 4)).toEqual(['blue', 'red', 'yellow', 'green']);
    expect(assignBalancedColors({ blue: 3, red: 1, yellow: 2, green: 2 }, 3)).toEqual([
      'red',
      'red',
      'yellow',
    ]);

    const counts: Record<string, number> = {};
    for (let team = 0; team < 25; team++) {
      for (const color of assignBalancedColors(counts, 4 + (team % 4))) {
        counts[color] = (counts[color] ?? 0) + 1;
      }
    }
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
});

describeDb('team portal, badges and jury management', () => {
  let app: Express;
  let prisma: PrismaClient;
  let mail: MemoryTransport;
  let adminToken: string;
  let juryToken: string;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
    app = createApp();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();
    mail = new MemoryTransport();
    setBadgeMailTransport(mail);

    const passwordHash = await hashPassword(PASSWORD);
    const admin = await createUser({
      role: 'admin',
      name: 'Admin',
      email: 'admin@portal.test',
      passwordHash,
    });
    const jury = await createUser({
      role: 'jury',
      name: 'Juror',
      email: 'juror@portal.test',
      passwordHash,
    });
    adminToken = (await createSessionForUser(admin.id)).token;
    juryToken = (await createSessionForUser(jury.id)).token;
  });

  afterEach(() => {
    setBadgeMailTransport(undefined);
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  function teamPayload(slug: string, memberCount = 3) {
    return {
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
        email: `member${index + 1}@${slug}.test`,
        university: 'Test University',
        phone: '+216 20 123 456',
      })),
    };
  }

  async function registerTeam(slug: string, memberCount = 3) {
    const response = await request(app)
      .post('/api/registration/teams')
      .send(teamPayload(slug, memberCount));
    expect(response.status).toBe(201);
    await waitForScheduledBadgeEmails();

    // Sessions are issued directly: the login endpoint is rate limited per IP,
    // and its behavior is covered by the auth tests.
    const leader = await prisma.user.findUniqueOrThrow({ where: { email: `leader@${slug}.test` } });

    return {
      body: teamRegistrationResponseSchema.parse(response.body),
      raw: response.body as { badges: Array<{ participantId: string; token: string }> },
      token: (await createSessionForUser(leader.id)).token,
    };
  }

  describe('registration', () => {
    it('spreads participants evenly across the four colors', async () => {
      await registerTeam('alpha', 3);
      await registerTeam('bravo', 5);
      await registerTeam('charlie', 6);

      const groups = await prisma.participant.groupBy({ by: ['color'], _count: { _all: true } });
      const counts = groups.map((group) => group._count._all);

      expect(groups.every((group) => group.color !== null)).toBe(true);
      expect(groups).toHaveLength(4);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      // Three registrations with bcrypt hashing: slow on CI and Windows machines.
    }, 30_000);

    it('does not email badges at registration: they wait for the admin dispatch', async () => {
      await registerTeam('golf', 3);

      expect(mail.sent).toHaveLength(0);
      const statuses = await prisma.qrToken.findMany({ select: { emailStatus: true } });
      expect(statuses).toHaveLength(4);
      // Not `pending`: the startup retry of interrupted emails must not send them.
      expect(statuses.every((row) => row.emailStatus === null)).toBe(true);
    });
  });

  describe('admin badge email dispatch', () => {
    function dispatch(body: Record<string, unknown> = {}, token = adminToken) {
      return request(app)
        .post('/api/admin/badges/send-all')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    }

    it('emails every participant their own QR badge and records the delivery', async () => {
      const team = await registerTeam('delta', 3);

      const response = await dispatch();
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ queued: 4 });
      await waitForScheduledBadgeEmails();

      expect(mail.sent.map((message) => message.to).sort()).toEqual(
        [
          'leader@delta.test',
          'member1@delta.test',
          'member2@delta.test',
          'member3@delta.test',
        ].sort(),
      );
      for (const message of mail.sent) {
        expect(message.attachments[0]?.contentType).toBe('image/png');
        expect(message.html).toContain('cid:badge-qr');
        // The raw token travels only inside the QR image.
        for (const badge of team.raw.badges) {
          expect(message.html).not.toContain(badge.token);
          expect(message.text).not.toContain(badge.token);
        }
      }

      const statuses = await prisma.qrToken.findMany({
        select: { emailStatus: true, emailLastSentAt: true },
      });
      expect(statuses.every((row) => row.emailStatus === 'sent' && row.emailLastSentAt)).toBe(true);
      expect(
        await prisma.auditLog.count({ where: { action: 'badge.email_bulk_resent' } }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('personalizes and escapes a custom subject and body, keeping the QR code', async () => {
      await registerTeam('hotel', 3);

      const response = await dispatch({
        subject: 'Badge for [participant name]',
        body: 'Hello [participant name] of [team name] ([color]) <script>alert(1)</script>',
      });
      expect(response.status).toBe(200);
      await waitForScheduledBadgeEmails();

      const leader = mail.sent.find((message) => message.to === 'leader@hotel.test');
      expect(leader?.subject).toBe('Badge for hotel Leader');
      expect(leader?.text).toMatch(/^Hello hotel Leader of Team hotel \(\w+\)/);
      expect(leader?.html).toContain('&lt;script&gt;');
      expect(leader?.html).not.toContain('<script>');
      expect(leader?.html).toContain('cid:badge-qr');
      expect(leader?.attachments[0]?.contentType).toBe('image/png');
    });

    it('answers before the emails are sent, one dispatch at a time', async () => {
      await registerTeam('india', 3);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      setBadgeMailTransport({
        sendMail: async () => {
          await gate;
          return {};
        },
      });

      const first = await dispatch();
      expect(first.status).toBe(200);
      const pending = await prisma.qrToken.findMany({ select: { emailStatus: true } });
      expect(pending.every((row) => row.emailStatus === 'pending')).toBe(true);

      const second = await dispatch();
      expect(second.status).toBe(409);

      release();
      await waitForScheduledBadgeEmails();
      const sent = await prisma.qrToken.findMany({ select: { emailStatus: true } });
      expect(sent.every((row) => row.emailStatus === 'sent')).toBe(true);
      expect((await dispatch()).status).toBe(200);
      await waitForScheduledBadgeEmails();
    });

    it('records failures when email delivery is unavailable', async () => {
      await registerTeam('echo');
      setBadgeMailTransport(null);

      expect((await dispatch()).status).toBe(200);
      await waitForScheduledBadgeEmails();
      const statuses = await prisma.qrToken.findMany({ select: { emailStatus: true } });
      expect(statuses.every((row) => row.emailStatus === 'failed')).toBe(true);
    });

    it('is admin-only and rejects unknown fields', async () => {
      const team = await registerTeam('juliett');

      expect((await dispatch({}, team.token)).status).toBe(403);
      expect((await dispatch({}, juryToken)).status).toBe(403);
      expect((await dispatch({ to: 'someone@else.test' })).status).toBe(400);
      expect(mail.sent).toHaveLength(0);
    });
  });

  describe('registration validation', () => {
    it('refuses a member already registered on another team, naming the email and field', async () => {
      await registerTeam('foxtrot');
      const payload = teamPayload('golf');
      payload.members[1].email = 'MEMBER2@foxtrot.test';

      const response = await request(app).post('/api/registration/teams').send(payload);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe(
        'member2@foxtrot.test is already registered on another team.',
      );
      expect(response.body.error.details).toEqual([
        { path: 'members.1.email', message: 'This person is already registered on another team.' },
      ]);
      expect(await prisma.team.count()).toBe(1);
    });

    it('refuses a leader email that is a member on another team', async () => {
      await registerTeam('hotel');
      const payload = teamPayload('india');
      payload.leader.email = 'member3@hotel.test';

      const response = await request(app).post('/api/registration/teams').send(payload);

      expect(response.status).toBe(409);
      expect(response.body.error.details[0].path).toBe('leader.email');
    });

    it('requires an email for every member', async () => {
      const payload = teamPayload('juliet') as { members: Array<{ name: string; email?: string }> };
      delete payload.members[0].email;

      const response = await request(app).post('/api/registration/teams').send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].path).toBe('members.0.email');
    });

    it('requires a university and a mobile number for every participant', async () => {
      const payload = teamPayload('kilo') as {
        leader: { phone?: string };
        members: Array<{ university?: string }>;
      };
      delete payload.leader.phone;
      delete payload.members[2].university;

      const response = await request(app).post('/api/registration/teams').send(payload);

      expect(response.status).toBe(400);
      const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
      expect(paths).toEqual(expect.arrayContaining(['leader.phone', 'members.2.university']));
    });

    it('stores the university and mobile number of each participant', async () => {
      const payload = teamPayload('lima');
      payload.members[0].university = 'ISITCom';
      payload.members[0].phone = '+216 98 765 432';

      const response = await request(app).post('/api/registration/teams').send(payload);

      expect(response.status).toBe(201);
      const stored = await prisma.participant.findFirstOrThrow({
        where: { email: 'member1@lima.test' },
      });
      expect(stored).toMatchObject({ university: 'ISITCom', phone: '+216 98 765 432' });
    });

    it('answers malformed JSON with a 400 validation error, not a 500', async () => {
      const response = await request(app)
        .post('/api/registration/teams')
        .set('Content-Type', 'application/json')
        .send('{"teamName": ');

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'The request body is not valid JSON.',
      });
    });
  });

  describe('GET /api/participants/team', () => {
    it('returns the caller team with colors and check-in state', async () => {
      const team = await registerTeam('kilo');

      const response = await request(app)
        .get('/api/participants/team')
        .set('Authorization', `Bearer ${team.token}`);

      expect(response.status).toBe(200);
      const summary = teamPortalSummarySchema.parse(response.body);
      expect(summary.id).toBe(team.body.id);
      expect(summary.members).toHaveLength(4);
      expect(summary.members[0].roleInTeam).toBe('leader');
      expect(summary.members.every((member) => member.color !== null)).toBe(true);
      expect(summary.isCheckedIn).toBe(false);
    });

    it('is team-only', async () => {
      expect((await request(app).get('/api/participants/team')).status).toBe(401);
      for (const token of [adminToken, juryToken]) {
        const response = await request(app)
          .get('/api/participants/team')
          .set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(403);
      }
    });
  });

  describe('GET /api/participants/badge', () => {
    it('shows every member badge of the caller team, matching the issued tokens', async () => {
      const team = await registerTeam('lima');

      const response = await request(app)
        .get('/api/participants/badge')
        .set('Authorization', `Bearer ${team.token}`);

      expect(response.status).toBe(200);
      const badges = teamBadgesResponseSchema.parse(response.body);
      expect(badges.teamId).toBe(team.body.id);
      expect(badges.badges).toHaveLength(4);

      const issued = new Map(team.raw.badges.map((badge) => [badge.participantId, badge.token]));
      for (const badge of badges.badges) {
        expect(badge.qrToken).toBe(issued.get(badge.participantId));
        expect(badge.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
        // Not emailed yet: the admin dispatch has not run, so no resend wait.
        expect(badge.emailStatus).toBeNull();
        expect(badge.emailResendAvailableAt).toBeNull();
      }
    });

    it('never exposes another team badges', async () => {
      const lima = await registerTeam('mike');
      const november = await registerTeam('november');

      const response = await request(app)
        .get('/api/participants/badge')
        .set('Authorization', `Bearer ${november.token}`);

      const shown = new Set(
        (response.body.badges as Array<{ participantId: string }>).map(
          (badge) => badge.participantId,
        ),
      );
      for (const badge of lima.raw.badges) {
        expect(shown.has(badge.participantId)).toBe(false);
      }
    });

    it('hides the token of a revoked badge', async () => {
      const team = await registerTeam('oscar');
      const target = team.raw.badges[1].participantId;
      await request(app)
        .post('/api/checkin/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ participantId: target });

      const response = await request(app)
        .get('/api/participants/badge')
        .set('Authorization', `Bearer ${team.token}`);
      const revoked = (
        response.body.badges as Array<{
          participantId: string;
          qrToken: string | null;
          isRevoked: boolean;
        }>
      ).find((badge) => badge.participantId === target);

      expect(revoked).toMatchObject({ qrToken: null, isRevoked: true });
    });
  });

  describe('resending a badge email', () => {
    async function ageLastEmail(participantId: string, msAgo: number) {
      await prisma.qrToken.update({
        where: { participantId },
        data: { emailLastSentAt: new Date(Date.now() - msAgo) },
      });
    }

    it('allows one resend per hour per participant for the team', async () => {
      const team = await registerTeam('papa');
      const target = team.raw.badges[2].participantId;
      const url = `/api/participants/badge/${target}/resend-email`;

      // A badge never emailed can be sent once right away; then the limit applies.
      const first = await request(app).post(url).set('Authorization', `Bearer ${team.token}`);
      expect(first.status).toBe(200);
      expect(first.body.emailStatus).toBe('sent');

      const tooSoon = await request(app).post(url).set('Authorization', `Bearer ${team.token}`);
      expect(tooSoon.status).toBe(429);
      expect(tooSoon.body.error.code).toBe('RATE_LIMITED');
      expect(tooSoon.body.error.details.emailResendAvailableAt).toEqual(expect.any(String));

      await ageLastEmail(target, BADGE_EMAIL_RESEND_INTERVAL_MS + 1000);
      const sentBefore = mail.sent.length;

      const allowed = await request(app).post(url).set('Authorization', `Bearer ${team.token}`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.emailStatus).toBe('sent');
      expect(mail.sent.length).toBe(sentBefore + 1);

      const again = await request(app).post(url).set('Authorization', `Bearer ${team.token}`);
      expect(again.status).toBe(429);
    });

    it('lets only one of several parallel resends through', async () => {
      const team = await registerTeam('quebec');
      const target = team.raw.badges[0].participantId;
      await ageLastEmail(target, BADGE_EMAIL_RESEND_INTERVAL_MS + 1000);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .post(`/api/participants/badge/${target}/resend-email`)
            .set('Authorization', `Bearer ${team.token}`),
        ),
      );

      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 429)).toHaveLength(4);
    });

    it('records a failed delivery and still applies the limit', async () => {
      const team = await registerTeam('romeo');
      const target = team.raw.badges[0].participantId;
      await ageLastEmail(target, BADGE_EMAIL_RESEND_INTERVAL_MS + 1000);
      mail.failNext = true;

      const response = await request(app)
        .post(`/api/participants/badge/${target}/resend-email`)
        .set('Authorization', `Bearer ${team.token}`);

      expect(response.status).toBe(200);
      expect(response.body.emailStatus).toBe('failed');
    });

    it('answers 404 for a participant of another team (no IDOR)', async () => {
      const sierra = await registerTeam('sierra');
      const tango = await registerTeam('tango');
      const foreign = sierra.raw.badges[0].participantId;
      await ageLastEmail(foreign, BADGE_EMAIL_RESEND_INTERVAL_MS + 1000);
      const sentBefore = mail.sent.length;

      const response = await request(app)
        .post(`/api/participants/badge/${foreign}/resend-email`)
        .set('Authorization', `Bearer ${tango.token}`);

      expect(response.status).toBe(404);
      expect(mail.sent.length).toBe(sentBefore);
    });

    it('validates the participant id', async () => {
      const team = await registerTeam('uniform');

      const response = await request(app)
        .post('/api/participants/badge/not-a-uuid/resend-email')
        .set('Authorization', `Bearer ${team.token}`);

      expect(response.status).toBe(400);
    });

    it('lets an admin resend without the hourly limit, audited', async () => {
      const team = await registerTeam('victor');
      const target = team.raw.badges[1].participantId;

      const response = await request(app)
        .post(`/api/admin/participants/${target}/resend-badge-email`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(await prisma.auditLog.count({ where: { action: 'badge.email_resent' } })).toBe(1);

      const asTeam = await request(app)
        .post(`/api/admin/participants/${target}/resend-badge-email`)
        .set('Authorization', `Bearer ${team.token}`);
      expect(asTeam.status).toBe(403);
    });

    it('reissues a badge issued before tokens were stored, invalidating the old QR code', async () => {
      const team = await registerTeam('whiskey');
      const target = team.raw.badges[0];
      await prisma.qrToken.update({
        where: { participantId: target.participantId },
        data: { tokenCiphertext: null },
      });
      await ageLastEmail(target.participantId, BADGE_EMAIL_RESEND_INTERVAL_MS + 1000);

      const before = await request(app)
        .get('/api/participants/badge')
        .set('Authorization', `Bearer ${team.token}`);
      expect(
        (before.body.badges as Array<{ participantId: string; qrToken: string | null }>).find(
          (badge) => badge.participantId === target.participantId,
        )?.qrToken,
      ).toBeNull();

      const resend = await request(app)
        .post(`/api/participants/badge/${target.participantId}/resend-email`)
        .set('Authorization', `Bearer ${team.token}`);
      expect(resend.status).toBe(200);

      const oldScan = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: target.token });
      expect(oldScan.status).toBe(404);

      const after = await request(app)
        .get('/api/participants/badge')
        .set('Authorization', `Bearer ${team.token}`);
      const fresh = (
        after.body.badges as Array<{ participantId: string; qrToken: string | null }>
      ).find((badge) => badge.participantId === target.participantId)?.qrToken;
      expect(fresh).toEqual(expect.any(String));

      const newScan = await request(app)
        .post('/api/checkin/scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: fresh });
      expect(newScan.status).toBe(200);
      expect(checkInResponseSchema.parse(newScan.body).participant.color).not.toBeNull();
    });
  });

  describe('admin jury management', () => {
    it('creates a jury account with a generated password the admin can read and the juror can use', async () => {
      const created = await request(app)
        .post('/api/admin/jury')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Dr. Jury', email: 'Dr.Jury@Portal.test' });

      expect(created.status).toBe(201);
      expect(created.body.email).toBe('dr.jury@portal.test');
      expect(created.body.password).toMatch(/^[A-Za-z0-9_-]{16}$/);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dr.jury@portal.test', password: created.body.password });
      expect(login.status).toBe(200);
      expect(login.body.account.role).toBe('jury');

      const list = await request(app)
        .get('/api/admin/jury')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      expect(list.body.items).toContainEqual(
        expect.objectContaining({ id: created.body.id, password: created.body.password }),
      );
      expect(await prisma.auditLog.count({ where: { action: 'jury.created' } })).toBe(1);
    });

    it('refuses a duplicate email', async () => {
      const response = await request(app)
        .post('/api/admin/jury')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Copy', email: 'juror@portal.test', password: 'a-long-jury-password' });

      expect(response.status).toBe(409);
    });

    it('changes the password, ending existing jury sessions', async () => {
      const created = await request(app)
        .post('/api/admin/jury')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rotating', email: 'rotating@portal.test', password: 'first-jury-password' });
      const session = await request(app)
        .post('/api/auth/login')
        .send({ email: 'rotating@portal.test', password: 'first-jury-password' });

      const updated = await request(app)
        .patch(`/api/admin/jury/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'second-jury-password', name: 'Rotated' });

      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ name: 'Rotated', password: 'second-jury-password' });
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${session.body.token}`);
      expect(me.status).toBe(401);
      const relogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'rotating@portal.test', password: 'second-jury-password' });
      expect(relogin.status).toBe(200);
    });

    it('deletes a jury account and its sessions', async () => {
      const created = await request(app)
        .post('/api/admin/jury')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Leaving', email: 'leaving@portal.test', password: 'leaving-jury-password' });
      const session = await request(app)
        .post('/api/auth/login')
        .send({ email: 'leaving@portal.test', password: 'leaving-jury-password' });

      const deleted = await request(app)
        .delete(`/api/admin/jury/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleted.status).toBe(204);
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${session.body.token}`);
      expect(me.status).toBe(401);
      expect(await prisma.auditLog.count({ where: { action: 'jury.deleted' } })).toBe(1);
    });

    it('cannot touch team or admin accounts through the jury routes', async () => {
      const team = await registerTeam('xray');
      const leader = await prisma.user.findUniqueOrThrow({ where: { email: 'leader@xray.test' } });

      const patch = await request(app)
        .patch(`/api/admin/jury/${leader.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'hijacked-password-123' });
      const remove = await request(app)
        .delete(`/api/admin/jury/${leader.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(patch.status).toBe(404);
      expect(remove.status).toBe(404);
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${team.token}`);
      expect(me.status).toBe(200);
    });

    it('is admin-only', async () => {
      const team = await registerTeam('yankee');

      for (const token of [team.token, juryToken]) {
        const list = await request(app)
          .get('/api/admin/jury')
          .set('Authorization', `Bearer ${token}`);
        const create = await request(app)
          .post('/api/admin/jury')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Sneaky', email: 'sneaky@portal.test' });
        expect(list.status).toBe(403);
        expect(create.status).toBe(403);
      }
      expect((await request(app).get('/api/admin/jury')).status).toBe(401);
    });

    it('rejects unknown fields and empty updates', async () => {
      const created = await request(app)
        .post('/api/admin/jury')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Strict', email: 'strict@portal.test', role: 'admin' });
      expect(created.status).toBe(400);

      const empty = await request(app)
        .patch('/api/admin/jury/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(empty.status).toBe(400);
    });
  });
});
