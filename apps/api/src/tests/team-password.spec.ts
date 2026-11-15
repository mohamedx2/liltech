import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { resetTeamPasswordResponseSchema } from 'api-contracts';
import { createApp } from '../app';
import { hashPassword } from '../modules/auth/password.service';
import { createSessionForUser, createUser } from '../modules/auth/auth.service';
import { setBadgeMailTransport } from '../modules/badges/badge-mailer';
import { waitForScheduledBadgeEmails } from '../modules/badges/badges.service';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from './test-database';

/** Admin reset of a team account password (forgotten shared login). */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const PASSWORD = 'original-team-password';

describeDb('admin team password reset', () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
    app = createApp();
    setBadgeMailTransport(null);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();
    const admin = await createUser({
      role: 'admin',
      name: 'Admin',
      email: 'admin@reset.test',
      passwordHash: await hashPassword(PASSWORD),
    });
    adminToken = (await createSessionForUser(admin.id)).token;
  });

  afterAll(async () => {
    setBadgeMailTransport(undefined);
    await destroyIntegrationDatabase();
  });

  async function registerTeam(slug: string) {
    const response = await request(app)
      .post('/api/registration/teams')
      .send({
        teamName: `Team ${slug}`,
        leader: { name: `${slug} Leader`, email: `leader@${slug}.test`, password: PASSWORD },
        members: [1, 2, 3].map((n) => ({ name: `${slug} ${n}`, email: `m${n}@${slug}.test` })),
      });
    expect(response.status).toBe(201);
    await waitForScheduledBadgeEmails();
    const leader = await prisma.user.findUniqueOrThrow({ where: { email: `leader@${slug}.test` } });
    return {
      teamId: response.body.id as string,
      session: (await createSessionForUser(leader.id)).token,
    };
  }

  it('sets a generated password, ends team sessions and lets the team log in with it', async () => {
    const team = await registerTeam('forgot');

    const reset = await request(app)
      .post(`/api/admin/teams/${team.teamId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reset.status).toBe(200);
    const body = resetTeamPasswordResponseSchema.parse(reset.body);
    expect(body).toMatchObject({ teamId: team.teamId, email: 'leader@forgot.test' });
    expect(body.password).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const oldSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${team.session}`);
    expect(oldSession.status).toBe(401);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'leader@forgot.test', password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'leader@forgot.test', password: body.password });
    expect(newLogin.status).toBe(200);

    expect(await prisma.auditLog.count({ where: { action: 'team.password_reset' } })).toBe(1);
  });

  it('accepts a password chosen by the admin and validates it', async () => {
    const team = await registerTeam('chosen');
    const url = `/api/admin/teams/${team.teamId}/reset-password`;

    const tooShort = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'short' });
    expect(tooShort.status).toBe(400);

    const chosen = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'admin-chosen-password' });
    expect(chosen.status).toBe(200);
    expect(chosen.body.password).toBe('admin-chosen-password');
  });

  it('is admin-only and answers 404 for an unknown team', async () => {
    const team = await registerTeam('guarded');

    const asTeam = await request(app)
      .post(`/api/admin/teams/${team.teamId}/reset-password`)
      .set('Authorization', `Bearer ${team.session}`);
    expect(asTeam.status).toBe(403);

    const unknown = await request(app)
      .post('/api/admin/teams/00000000-0000-4000-8000-000000000000/reset-password')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unknown.status).toBe(404);
  });
});
