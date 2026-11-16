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

  it('signs in against the real auth contract, stores the token, and sends it on later requests', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createApiClient(
      createRealTransport({ baseUrl: 'http://localhost:4000/api', fetchImpl: fetchMock }),
    );
    const token = 'test-session-token-0123456789abcdef';
    const account = {
      id: '11111111-1111-4111-8111-111111111111',
      role: Role.Team,
      name: 'Test Leader',
      email: 'ctf.test@liltech.tn',
    };

    // Canonical `POST /auth/login` body shape.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ account, token, expiresAt: '2026-11-16T17:54:30.602Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const login = await client.auth.login({
      email: 'ctf.test@liltech.tn',
      password: 'Louage404!Test2026',
    });
    expect(login.user).toMatchObject({ role: Role.Team, name: 'Test Leader' });
    expect(login.expiresAt).toBe('2026-11-16T17:54:30.602Z');

    // The stored bearer token must ride along on authenticated calls.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await client.request('/ctf/chain');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });

    // `GET /auth/me` returns the account itself, not a `{ user }` envelope.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(account), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const session = await client.auth.getSession();
    expect(session.user?.email).toBe('ctf.test@liltech.tn');

    // Signing out must drop the token so later requests are anonymous.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.auth.logout();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await client.request('/ctf/chain');
    expect(fetchMock.mock.calls[4]?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('accepts the real backend registration response and keeps the one-time badge tokens', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createApiClient(
      createRealTransport({ baseUrl: 'http://localhost:4000/api', fetchImpl: fetchMock }),
    );

    const participants = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Leader Real', isLeader: true },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mate One', isLeader: false },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Mate Three', isLeader: false },
      { id: '44444444-4444-4444-8444-444444444444', name: 'Mate Two', isLeader: false },
    ];
    const badges = participants.map((participant, index) => ({
      participantId: participant.id,
      participantName: participant.name,
      token: String(index).repeat(43),
      issuedAt: '2026-11-14T20:00:00.000Z',
    }));

    // Exact shape of `POST /api/registration/teams` (201) from apps/api.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Real Pioneers',
          progressState: 'registered',
          createdAt: '2026-11-14T20:00:00.000Z',
          leader: { id: '66666666-6666-4666-8666-666666666666', name: 'Leader Real' },
          participants,
          badges,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const registered = await client.registrations.registerTeam({
      teamName: 'Real Pioneers',
      password: 'password123456',
      leader: { fullName: 'Leader Real', email: 'leader.real@example.com' },
      teammates: [
        { fullName: 'Mate One', email: 'mate1@example.com' },
        { fullName: 'Mate Two', email: 'mate2@example.com' },
        { fullName: 'Mate Three', email: 'mate3@example.com' },
      ],
    });

    expect(registered.teamName).toBe('Real Pioneers');
    expect(registered.participantCount).toBe(4);
    expect(registered.badges).toEqual(
      badges.map(({ participantId, participantName, token }) => ({
        participantId,
        participantName,
        token,
      })),
    );
  });

  it('supports health, event state, registration, and auth session flows in MockTransport', async () => {
    const client = createApiClient(createMockTransport({ latencyMs: 0 }));

    const health = await client.getHealth();
    expect(health.status).toBe('ok');

    const eventState = await client.events.getEventState();
    expect(eventState.phase).toBe(EventPhase.Registration);

    const registered = await client.registrations.registerTeam({
      teamName: 'Mock Pioneers',
      password: 'password123456',
      leader: { fullName: 'Leader Mock', email: 'leader.mock@liltech.mock' },
      teammates: [
        { fullName: 'Mate One', email: 'mate1@liltech.mock' },
        { fullName: 'Mate Two', email: 'mate2@liltech.mock' },
        { fullName: 'Mate Three', email: 'mate3@liltech.mock' },
      ],
    });
    expect(registered.status).toBe(TeamProgressState.Registered);
    expect(registered.participantCount).toBe(4);

    const loginRes = await client.auth.login({
      email: 'leader.mock@liltech.mock',
      password: 'password123456',
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
