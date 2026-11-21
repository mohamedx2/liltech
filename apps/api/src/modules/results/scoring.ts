import { CHALLENGE_WEIGHTS, juryWeightedTotal, type ChallengePosition } from 'api-contracts';

/**
 * Pure scoring rules for the results board. Single source of truth for how a
 * juror's criteria, the Mini-CTF and the two challenges add up to the final
 * score out of 100 (weights live in `api-contracts` → results-contracts).
 */

/** Rounds to the two decimals results are shown with. */
export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The four criterion columns stored for one juror's evaluation. */
export interface JurorCriteria {
  technicalExecution: number;
  innovationOriginality: number;
  uiUxDesign: number;
  pitchPresentation: number;
}

/** One juror's weighted total out of 100 (each criterion is entered out of 25). */
export function jurorWeightedTotal(criteria: JurorCriteria): number {
  return juryWeightedTotal({
    ui_ux_design: criteria.uiUxDesign,
    innovation_originality: criteria.innovationOriginality,
    technical_execution: criteria.technicalExecution,
    pitch_presentation: criteria.pitchPresentation,
  });
}

export interface ResolvedChallengeScore {
  /** Average of the jurors' weighted totals; `null` when nobody scored. */
  juryAverage: number | null;
  /** The override, else the jury average, else 0. */
  score: number;
  /** Contribution to the final score. */
  points: number;
}

export function resolveChallengeScore(
  position: ChallengePosition,
  jurorTotals: readonly number[],
  override: number | null,
): ResolvedChallengeScore {
  const juryAverage =
    jurorTotals.length > 0
      ? roundScore(jurorTotals.reduce((sum, value) => sum + value, 0) / jurorTotals.length)
      : null;
  const score = override ?? juryAverage ?? 0;

  return {
    juryAverage,
    score,
    points: roundScore((score * CHALLENGE_WEIGHTS[position]) / 100),
  };
}

/** Mini-CTF points in use: the override, else the automatic points, else 0. */
export function resolveCtfPoints(automatic: number | null, override: number | null): number {
  return override ?? automatic ?? 0;
}

/** Standard competition ranking (1, 1, 3): equal totals share a rank. */
export function rankByTotal<T extends { total: number; teamName: string }>(
  rows: readonly T[],
): Array<T & { rank: number }> {
  const sorted = [...rows].sort(
    (left, right) => right.total - left.total || left.teamName.localeCompare(right.teamName),
  );

  let previousTotal: number | null = null;
  let previousRank = 0;

  return sorted.map((row, index) => {
    const rank = row.total === previousTotal ? previousRank : index + 1;
    previousTotal = row.total;
    previousRank = rank;
    return { ...row, rank };
  });
}
