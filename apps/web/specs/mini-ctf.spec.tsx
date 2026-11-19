import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CtfChainResponse, CtfCurrentStage, CtfTrackItem } from 'api-contracts';
import { MiniCtfView } from '@/features/mini-ctf/mini-ctf-view';
import { api, ApiClientError } from '@/lib/api';

/**
 * UI states for the LOUAGE 404 chain. Fixtures are synthetic: no real flag,
 * hint or Drive folder ever appears in this repository.
 */

const TRACK = (states: Array<'locked' | 'unlocked' | 'solved'>): CtfTrackItem[] =>
  states.map((state, index) => ({
    slug: `louage-404-0${index + 1}`,
    position: index + 1,
    title: `Stage ${index + 1}`,
    state,
    status: 'live',
    requiredForUnlock: true,
  }));

const CURRENT: CtfCurrentStage = {
  stage: {
    slug: 'louage-404-01',
    position: 1,
    totalStages: 7,
    title: 'The Louage',
    description: 'Identify the vehicle in the photograph.',
    status: 'live',
    state: 'unlocked',
    assetDriveUrl: 'https://drive.google.com/drive/folders/fixture',
    hintCount: 3,
  },
  progress: { attempts: 0, hintsUsed: 0, solved: false, solvedAt: null },
  hints: [],
};

const CHAIN: CtfChainResponse = {
  team: { name: 'Fixture Builders', points: null, solvedAt: null },
  stages: TRACK(['unlocked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked']),
  current: CURRENT,
  summary: { solved: 0, total: 7 },
  eligible: true,
  timing: {
    startedAt: '2026-11-21T20:00:00.000Z',
    closesAt: '2026-11-21T21:00:00.000Z',
    open: true,
    closed: false,
    serverTime: '2026-11-21T20:10:00.000Z',
  },
};

function withCurrent(patch: Partial<CtfCurrentStage>, chainPatch: Partial<CtfChainResponse> = {}) {
  return {
    ...CHAIN,
    ...chainPatch,
    current: { ...CURRENT, ...patch },
  } satisfies CtfChainResponse;
}

describe('MiniCtfView (LOUAGE 404)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a loading state before the chain arrives', async () => {
    vi.spyOn(api.ctf, 'getChain').mockReturnValue(new Promise(() => undefined));

    render(<MiniCtfView />);

    expect(screen.getByText(/Loading the LOUAGE 404 investigation/i)).toBeTruthy();
  });

  it('shows a retryable error when the chain request fails', async () => {
    vi.spyOn(api.ctf, 'getChain').mockRejectedValue(
      new ApiClientError({ message: 'Network unreachable.', status: null, code: 'NETWORK' }),
    );

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByText(/Mini-CTF unavailable/i)).toBeTruthy();
    });
    expect(screen.getByText(/Network unreachable\./i)).toBeTruthy();
  });

  it('renders the tracker and the current stage with its Drive resources', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue(CHAIN);

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /The Louage/i })).toBeTruthy();
    });

    expect(screen.getByText(/Stage 01 \/ 07/i)).toBeTruthy();
    expect(screen.getByText(/Fixture Builders/i)).toBeTruthy();
    expect(screen.getByText(/0\/7 solved/i)).toBeTruthy();

    const drive = screen.getByRole('link', { name: /Open Google Drive/i });
    expect(drive.getAttribute('href')).toBe('https://drive.google.com/drive/folders/fixture');
    expect(drive.getAttribute('target')).toBe('_blank');
    expect(drive.getAttribute('rel')).toContain('noopener');

    const locked = screen.getByRole('list', { name: /Mini-CTF stages/i });
    expect(locked.querySelectorAll('li')).toHaveLength(7);
  });

  it('explains missing resources instead of rendering a broken link', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue(
      withCurrent({
        stage: { ...CURRENT.stage, assetDriveUrl: null },
      }),
    );

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByText(/have not been published yet/i)).toBeTruthy();
    });
    expect(screen.queryByRole('link', { name: /Open Google Drive/i })).toBeNull();
  });

  it('keeps the gate shut for a team that has not checked in', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue({
      ...CHAIN,
      current: null,
      eligible: false,
      stages: TRACK(Array(7).fill('locked') as Array<'locked'>),
    });

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByText(/The Mini-CTF is locked/i)).toBeTruthy();
    });
    expect(screen.queryByLabelText(/Flag/i)).toBeNull();
  });

  it('reveals hints one at a time and shows the ones already paid for', async () => {
    vi.spyOn(api.ctf, 'getChain')
      .mockResolvedValueOnce(CHAIN)
      .mockResolvedValueOnce(
        withCurrent({
          progress: { ...CURRENT.progress, hintsUsed: 1 },
          hints: [{ position: 1, body: 'First fixture hint.' }],
        }),
      );
    const reveal = vi.spyOn(api.ctf, 'revealHint').mockResolvedValue({
      hint: { position: 1, body: 'First fixture hint.' },
      hintsUsed: 1,
      hintCount: 3,
    });

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reveal hint 1 of 3/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reveal hint 1 of 3/i }));

    await waitFor(() => {
      expect(screen.getByText('First fixture hint.')).toBeTruthy();
    });
    expect(reveal).toHaveBeenCalledWith('louage-404-01');
  });

  it('reports an incorrect flag without unlocking anything', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue(CHAIN);
    vi.spyOn(api.ctf, 'submitAnswer').mockRejectedValue(
      new ApiClientError({
        message: 'Incorrect flag. Try again.',
        status: 400,
        code: 'CTF_NOT_SOLVED',
      }),
    );

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Flag/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/Flag/i), { target: { value: 'L404{wrong}' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit flag/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Incorrect flag/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Investigation completed/i)).toBeNull();
  });

  it('shows the rate-limit state clearly', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue(CHAIN);
    vi.spyOn(api.ctf, 'submitAnswer').mockRejectedValue(
      new ApiClientError({
        message: 'Too many attempts. Try again in 42s.',
        status: 429,
        code: 'RATE_LIMITED',
      }),
    );

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Flag/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/Flag/i), { target: { value: 'L404{guess}' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit flag/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Too many attempts/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/42s/)).toBeTruthy();
  });

  it('moves to the next stage after a correct flag', async () => {
    const nextStage: CtfCurrentStage = {
      ...CURRENT,
      stage: {
        ...CURRENT.stage,
        slug: 'louage-404-02',
        position: 2,
        title: 'The Location',
        assetDriveUrl: null,
      },
    };

    vi.spyOn(api.ctf, 'getChain')
      .mockResolvedValueOnce(CHAIN)
      .mockResolvedValueOnce({
        ...CHAIN,
        stages: TRACK(['solved', 'unlocked', 'locked', 'locked', 'locked', 'locked', 'locked']),
        current: nextStage,
        summary: { solved: 1, total: 7 },
      });
    vi.spyOn(api.ctf, 'submitAnswer').mockResolvedValue({
      correct: true,
      stageSolved: true,
      stageSlug: 'louage-404-01',
      nextStageUnlocked: true,
      nextStagePosition: 2,
      completedChain: false,
      message: 'Correct flag. The next stage is unlocked.',
    });

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Flag/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/Flag/i), { target: { value: 'L404{fixture}' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit flag/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /The Location/i })).toBeTruthy();
    });
    expect(screen.getByText(/1\/7 solved/i)).toBeTruthy();
  });

  it('shows the final completion screen once the chain is solved', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue({
      ...CHAIN,
      current: null,
      stages: TRACK(Array(7).fill('solved') as Array<'solved'>),
      summary: { solved: 7, total: 7 },
    });

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByText(/Investigation completed/i)).toBeTruthy();
    });
    expect(screen.getByText(/You were the missing passenger all along\./i)).toBeTruthy();

    const link = screen.getByRole('link', { name: /Go to Main Challenge/i });
    expect(link.getAttribute('href')).toBe('/team/challenge');
  });

  it('shows an unpublished stage as unavailable and disables submission', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue(
      withCurrent({
        stage: {
          ...CURRENT.stage,
          slug: 'louage-404-05',
          position: 5,
          title: 'Find Si Mokdad',
          status: 'draft',
          assetDriveUrl: null,
        },
      }),
    );

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByText(/Not published yet/i)).toBeTruthy();
    });
    expect((screen.getByLabelText(/Flag/i) as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: /Submit flag/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('never renders a flag-shaped placeholder or an answer', async () => {
    vi.spyOn(api.ctf, 'getChain').mockResolvedValue(CHAIN);

    render(<MiniCtfView />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Flag/i)).toBeTruthy();
    });

    const placeholder = (screen.getByLabelText(/Flag/i) as HTMLInputElement).placeholder;
    expect(placeholder).toBe('Enter your flag...');
    expect(document.body.innerHTML).not.toMatch(/L404\{[^}]*[a-z0-9]{3,}/i);
  });
});
