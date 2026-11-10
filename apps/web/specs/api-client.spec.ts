import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventPhase, Role, TeamProgressState } from 'api-contracts';
import { ApiClientError, createApiClient } from '../src/lib/api';
import { createMockTransport } from '../src/lib/api/transports/mock';
import { resetDevMockState } from '../src/lib/api/transports/mocks/dev-state';
import { buildRequestUrl, createRealTransport } from '../src/lib/api/transports/real';

describe('API Client, RealTransport, and MockTransport', () => {
  beforeEach(() => {
    resetDevMockState();
  });

  it('joins baseUrl and path without dropping the /api base path prefix', () => {
    expect(buildRequestUrl('http://localhost:4000/api', '/health')).toBe(
      'http://localhost:4000/api/health',
    );
    expect(buildRequestUrl('http://localhost:4000/api/', 'auth/login')).toBe(
      'http://localhost:4000/api/auth/login',
    );
  });

  it('handles 200 JSON, 204 empty, API error contracts, invalid JSON, and network failures in RealTransport', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const transport = createRealTransport({
      baseUrl: 'http://localhost:4000/api',
      fetchImpl: fetchMock,
    });
    const client = createApiClient(transport);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: 10,
          timestamp: '2026-11-21T18:00:00.000Z',
          database: { status: 'up', latencyMs: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const health = await client.getHealth();
    expect(health.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/health',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );

    // 204 No Content
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(client.auth.logout()).resolves.toBeUndefined();

    // Canonical error envelope { error: { code, message } }
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'CTF_NOT_SOLVED', message: 'Solve the Mini-CTF first.' },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(transport.request('/challenges')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'CTF_NOT_SOLVED',
      message: 'Solve the Mini-CTF first.',
    });

    // Non-JSON payload
    fetchMock.mockResolvedValueOnce(new Response('bad-gateway-html', { status: 502 }));
    await expect(transport.request('/health')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_RESPONSE',
    });

    // Network exception
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(transport.request('/health')).rejects.toMatchObject({
      status: null,
      code: 'NETWORK_ERROR',
      isNetworkError: true,
    });
  });

  it('supports health, event state, registration, and auth session flows in MockTransport', async () => {
    const client = createApiClient(createMockTransport({ latencyMs: 0 }));

    const health = await client.getHealth();
    expect(health.status).toBe('ok');

    const eventState = await client.events.getEventState();
    expect(eventState.phase).toBe(EventPhase.Registration);

    const registered = await client.registrations.registerTeam({
      teamName: 'Mock Pioneers',
      password: 'password123',
      leader: { fullName: 'Leader Mock', email: 'leader.mock@liltech.mock' },
      teammates: [
        { fullName: 'Mate One', email: 'mate1@liltech.mock' },
        { fullName: 'Mate Two', email: 'mate2@liltech.mock' },
      ],
    });
    expect(registered.status).toBe(TeamProgressState.Registered);
    expect(registered.participantCount).toBe(3);

    const loginRes = await client.auth.login({
      email: 'leader.mock@liltech.mock',
      password: 'password123',
    });
    expect(loginRes.user.role).toBe(Role.Team);

    const sessionRes = await client.auth.getSession();
    expect(sessionRes.user?.email).toBe('leader.mock@liltech.mock');

    await client.auth.logout();
    const afterLogout = await client.auth.getSession();
    expect(afterLogout.user).toBeNull();

    await expect(client.request('/does-not-exist')).rejects.toBeInstanceOf(ApiClientError);
  });
});
