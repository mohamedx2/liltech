import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from './app';

/**
 * Integration tests for the Express app.
 * These run without a database — `GET /api/health` degrades gracefully (503)
 * when PostgreSQL is unreachable, which is itself part of the contract.
 */
describe('api app', () => {
  it('returns the API error contract for unknown routes', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot find GET /api/does-not-exist.',
      },
    });
  });

  it('attaches a request id header to responses', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');

    expect(response.headers['x-request-id']).toBeDefined();
  });

  // When a test database is configured (TEST_DATABASE_URL) the health check
  // reaches it, so the degraded path only holds in the database-free default run.
  const dbReachable = Boolean(process.env.TEST_DATABASE_URL);

  it.skipIf(dbReachable)('degrades gracefully when the database is unreachable', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.database.status).toBe('down');
    expect(response.body.timestamp).toBeDefined();
  });

  it.skipIf(!dbReachable)('reports ok when a test database is reachable', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database.status).toBe('up');
  });
});
