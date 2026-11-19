import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { waitForScheduledBadgeEmails } from '../modules/badges/badges.service';
import {
  backfillReadableBadges,
  retryInterruptedBadgeEmails,
  runBadgeMaintenance,
} from '../modules/badges/badge-maintenance.service';
import {
  setBadgeMailTransport,
  type BadgeMailMessage,
  type BadgeMailTransport,
} from '../modules/badges/badge-mailer';
import { isNextPhase } from '../modules/event-state/event-state.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/**
 * Event-night hardening: phase guard rails, registration closing, check-in
 * progress, security headers, request ids, and badge maintenance (backfill
 * of unreadable badges, retry of interrupted emails, admin "send unsent").
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'hardening-password-2026';

class MemoryTransport implements BadgeMailTransport {
  readonly sent: BadgeMailMessage[] = [];

  async sendMail(message: BadgeMailMessage): Promise<unknown> {
    this.sent.push(message);
    return {};
  }
}

describe('isNextPhase', () => {
  it('accepts only the next phase in order', () => {
    expect(isNextPhase('registration', 'checkin')).toBe(true);
    expect(isNextPhase('checkin', 'live')).toBe(true);
    expect(isNextPhase('registration', 'live')).toBe(false);
    expect(isNextPhase('live', 'checkin')).toBe(false);
    expect(isNextPhase('pitching', 'results')).toBe(true);
  });
});

describe('request ids and security headers', () => {
  const app = createApp();

  it('keeps a safe client request id and replaces an unsafe one', async () => {
    const safe = await request(app).get('/api/nope').set('x-request-id', 'client-abc_123.4');
    expect(safe.headers['x-request-id']).toBe('client-abc_123.4');

    const unsafe = await request(app).get('/api/nope').set('x-request-id', 'bad id\twith "quotes"');
    expect(unsafe.headers['x-request-id']).not.toContain('bad');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends the standard security headers', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describeDb('event hardening', () => {
  let app: Express;
  let prisma: PrismaClient;
  let mail: MemoryTransport;
  let adminToken: string;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
    app = createApp();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();
    mail = new MemoryTransport();
    setBadgeMailTransport(mail);
    const admin = await createUser({
      role: 'admin',
      name: 'Admin',
      email: 'admin@hardening.test',
      passwordHash: await hashPassword(PASSWORD),
    });
    adminToken = (await createSessionForUser(admin.id)).token;
  });

  afterEach(() => {
    setBadgeMailTransport(undefined);
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  const asAdmin = (call: request.Test) => call.set('Authorization', `Bearer ${adminToken}`);

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
          name: `${slug} ${n}`,
          email: `m${n}@${slug}.test`,
          university: 'Test University',
          phone: '+216 20 123 456',
        })),
      });
    expect(response.status).toBe(201);
    await waitForScheduledBadgeEmails();
    return response.body as { id: string; badges: Array<{ participantId: string; token: string }> };
  }

  describe('phase guard rails', () => {
    it('moves one step at a time and audits from -> to', async () => {
      const step = await asAdmin(request(app).post('/api/event-state')).send({ phase: 'checkin' });
      expect(step.status).toBe(200);

      const audit = await asAdmin(request(app).get('/api/admin/audit-log'));
      expect(audit.body.items[0]).toMatchObject({
        action: 'event.phase_changed',
        summary: 'registration -> checkin',
      });
    });

    it('refuses a jump or a step back without force, and audits the override', async () => {
      const jump = await asAdmin(request(app).post('/api/event-state')).send({ phase: 'results' });
      expect(jump.status).toBe(409);

      const forced = await asAdmin(request(app).post('/api/event-state')).send({
        phase: 'live',
        force: true,
      });
      expect(forced.status).toBe(200);

      const back = await asAdmin(request(app).post('/api/event-state')).send({ phase: 'checkin' });
      expect(back.status).toBe(409);

      const audit = await asAdmin(request(app).get('/api/admin/audit-log'));
      expect(audit.body.items[0].summary).toBe('registration -> live (override)');
    });
  });

  describe('registration closing', () => {
    it('stays open during check-in', async () => {
      await asAdmin(request(app).post('/api/event-state')).send({ phase: 'checkin' });
      await registerTeam('checkin');
    });

    it('refuses new teams once the event is live', async () => {
      await asAdmin(request(app).post('/api/event-state')).send({ phase: 'live', force: true });

      const response = await request(app)
        .post('/api/registration/teams')
        .send({
          teamName: 'Too Late',
          leader: {
            name: 'Late',
            email: 'late@late.test',
            password: PASSWORD,
            university: 'Test University',
            phone: '+216 20 123 456',
          },
          members: [1, 2, 3].map((n) => ({
            name: `Late ${n}`,
            email: `m${n}@late.test`,
            university: 'Test University',
            phone: '+216 20 123 456',
          })),
        });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('Registration is closed.');
      expect(await prisma.team.count()).toBe(0);
    });
  });

  describe('check-in progress', () => {
    it('never moves a team that already progressed back to checked_in', async () => {
      const team = await registerTeam('late');
      await prisma.team.update({ where: { id: team.id }, data: { progressState: 'ctf_solved' } });

      const scan = await asAdmin(request(app).post('/api/checkin/scan')).send({
        token: team.badges[2].token,
      });

      expect(scan.status).toBe(200);
      const after = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
      expect(after.progressState).toBe('ctf_solved');
    });

    it('still advances a registered team on its first check-in', async () => {
      const team = await registerTeam('first');

      await asAdmin(request(app).post('/api/checkin/scan')).send({ token: team.badges[0].token });

      const after = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
      expect(after.progressState).toBe('checked_in');
    });
  });

  describe('badge maintenance', () => {
    it('reissues hash-only badges so every QR code is readable, idempotently', async () => {
      const team = await registerTeam('legacy');
      const legacy = team.badges[0];
      const revoked = team.badges[1];
      await prisma.qrToken.update({
        where: { participantId: legacy.participantId },
        data: { tokenCiphertext: null },
      });
      await prisma.qrToken.update({
        where: { participantId: revoked.participantId },
        data: { tokenCiphertext: null, revokedAt: new Date() },
      });

      expect(await backfillReadableBadges()).toEqual({ created: 0, reissued: 1 });
      expect(await backfillReadableBadges()).toEqual({ created: 0, reissued: 0 });

      const fixed = await prisma.qrToken.findUniqueOrThrow({
        where: { participantId: legacy.participantId },
      });
      expect(fixed.tokenCiphertext).not.toBeNull();
      // Queued, so the startup retry emails the new QR code.
      expect(fixed.emailStatus).toBe('pending');
      const stillRevoked = await prisma.qrToken.findUniqueOrThrow({
        where: { participantId: revoked.participantId },
      });
      expect(stillRevoked.tokenCiphertext).toBeNull();

      // The old code no longer checks anyone in.
      const oldScan = await asAdmin(request(app).post('/api/checkin/scan')).send({
        token: legacy.token,
      });
      expect(oldScan.status).toBe(404);
    });

    it('emails the reissued badge during the same startup repair', async () => {
      const team = await registerTeam('reissue-mail');
      const legacy = team.badges[0];
      await waitForScheduledBadgeEmails();
      await prisma.qrToken.update({
        where: { participantId: legacy.participantId },
        data: { tokenCiphertext: null, emailStatus: 'sent' },
      });
      const before = mail.sent.length;

      await runBadgeMaintenance();
      await waitForScheduledBadgeEmails();

      expect(mail.sent.length).toBe(before + 1);
      const badge = await prisma.qrToken.findUniqueOrThrow({
        where: { participantId: legacy.participantId },
      });
      expect(badge.emailStatus).toBe('sent');
    });

    it('creates a badge for a participant that has none', async () => {
      const team = await registerTeam('nobadge');
      await prisma.qrToken.delete({ where: { participantId: team.badges[3].participantId } });

      expect(await backfillReadableBadges()).toEqual({ created: 1, reissued: 0 });
      expect(await prisma.qrToken.count()).toBe(4);
    });

    it('re-sends badge emails left pending by a restart', async () => {
      const team = await registerTeam('restart');
      await prisma.qrToken.update({
        where: { participantId: team.badges[0].participantId },
        data: { emailStatus: 'pending', emailLastSentAt: null },
      });
      const before = mail.sent.length;

      expect(await retryInterruptedBadgeEmails()).toBe(1);
      await waitForScheduledBadgeEmails();

      expect(mail.sent.length).toBe(before + 1);
      const badge = await prisma.qrToken.findUniqueOrThrow({
        where: { participantId: team.badges[0].participantId },
      });
      expect(badge.emailStatus).toBe('sent');
    });
  });
});
