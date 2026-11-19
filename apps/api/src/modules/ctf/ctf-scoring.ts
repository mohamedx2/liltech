/**
 * Mini-CTF scoring.
 *
 * The Mini-CTF is worth 10% of the final event score. Points depend on how fast
 * a team clears the whole required chain, measured from the launch instant the
 * server recorded (`EventPhaseState.ctfStartedAt`) to the instant of the final
 * correct flag.
 *
 * Single source of truth: change a band here and nowhere else.
 */

/** The Mini-CTF runs for 60 minutes from its launch. */
export const CTF_WINDOW_MINUTES = 60;

export const CTF_WINDOW_MS = CTF_WINDOW_MINUTES * 60_000;

export interface CtfScoringBand {
  /** Upper bound of the band, in minutes (exclusive). */
  readonly maxMinutes: number;
  readonly points: number;
}

/**
 * Faster teams score more. Boundaries are exclusive on the upper side:
 * exactly 15:00 belongs to the 7-point band, exactly 60:00 scores 0.
 */
export const CTF_SCORING_BANDS: readonly CtfScoringBand[] = [
  { maxMinutes: 15, points: 10 },
  { maxMinutes: 30, points: 7 },
  { maxMinutes: 45, points: 4.5 },
  { maxMinutes: 60, points: 2.5 },
];

/** Points for an elapsed solve time; 0 once the 60-minute window is over. */
export function ctfPointsForElapsed(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) {
    return 0;
  }

  // A negative elapsed time can only come from clock drift; treat it as an
  // instant solve rather than punishing the team.
  const elapsed = Math.max(0, elapsedMs);

  for (const band of CTF_SCORING_BANDS) {
    if (elapsed < band.maxMinutes * 60_000) {
      return band.points;
    }
  }

  return 0;
}

/** The instant the Mini-CTF closes, given its launch instant. */
export function ctfClosesAt(ctfStartedAt: Date): Date {
  return new Date(ctfStartedAt.getTime() + CTF_WINDOW_MS);
}

/** Points for a team that finished the chain at `solvedAt`. */
export function ctfPointsSince(ctfStartedAt: Date, solvedAt: Date): number {
  return ctfPointsForElapsed(solvedAt.getTime() - ctfStartedAt.getTime());
}
