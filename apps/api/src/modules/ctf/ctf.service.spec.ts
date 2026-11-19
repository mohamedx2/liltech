import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    team: { findUnique: vi.fn() },
    ctfStage: { findMany: vi.fn() },
    ctfProgress: { findMany: vi.fn(), createMany: vi.fn() },
  },
}));

vi.mock('../../config/database', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../event-state/event-state.service', () => ({
  getEventState: vi.fn(),
}));

import { getEventState } from '../event-state/event-state.service';
import { getChain, getStage, revealNextHint, submitAnswer } from './ctf.service';

describe('Mini-CTF event gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.team.findUnique.mockResolvedValue({
      id: 'team-1',
      name: 'Checked-in team',
      progressState: 'checked_in',
    });
    prismaMock.ctfStage.findMany.mockResolvedValue([
      {
        id: 'stage-1',
        slug: 'stage-1',
        position: 1,
        title: 'Stage 1',
        description: null,
        status: 'live',
        answerHash: 'a'.repeat(64),
        assetDriveUrl: null,
        requiredForUnlock: true,
        hints: [],
      },
    ]);
    prismaMock.ctfProgress.findMany.mockResolvedValue([]);
    prismaMock.ctfProgress.createMany.mockResolvedValue({ count: 1 });
  });

  it('does not reveal or persist stage one before an admin starts the event', async () => {
    vi.mocked(getEventState).mockResolvedValue({
      phase: 'checkin',
      phaseChangedAt: new Date('2026-11-21T17:00:00.000Z'),
      ctfStartedAt: null,
    });

    await expect(getChain('user-1')).rejects.toMatchObject({
      code: 'EVENT_NOT_LIVE',
      status: 403,
    });
    expect(prismaMock.ctfProgress.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['stage detail', () => getStage('user-1', 'stage-1')],
    ['hint reveal', () => revealNextHint('user-1', 'stage-1')],
    ['answer submission', () => submitAnswer('user-1', 'stage-1', 'test-answer')],
  ])('blocks %s outside the live phase without touching CTF data', async (_operation, run) => {
    vi.mocked(getEventState).mockResolvedValue({
      phase: 'results',
      phaseChangedAt: new Date('2026-11-22T10:00:00.000Z'),
      ctfStartedAt: null,
    });

    await expect(run()).rejects.toMatchObject({ code: 'EVENT_NOT_LIVE', status: 403 });
    expect(prismaMock.ctfStage.findMany).not.toHaveBeenCalled();
    expect(prismaMock.ctfProgress.createMany).not.toHaveBeenCalled();
  });

  it('opens stage one after an admin moves the event to live', async () => {
    vi.mocked(getEventState).mockResolvedValue({
      phase: 'live',
      phaseChangedAt: new Date('2026-11-21T19:00:00.000Z'),
      // The Mini-CTF window runs 60 minutes from the recorded launch instant.
      ctfStartedAt: new Date(),
    });

    const chain = await getChain('user-1');

    expect(chain.current?.stage.slug).toBe('stage-1');
    expect(prismaMock.ctfProgress.createMany).toHaveBeenCalledOnce();
  });
});
