import { describe, expect, it } from 'vitest';
import {
  jurorWeightedTotal,
  rankByTotal,
  resolveChallengeScore,
  resolveCtfPoints,
  roundScore,
} from './scoring';

const criteria = (
  uiUxDesign: number,
  innovationOriginality: number,
  technicalExecution: number,
  pitchPresentation: number,
) => ({ uiUxDesign, innovationOriginality, technicalExecution, pitchPresentation });

describe('jurorWeightedTotal', () => {
  it('weights Solution 35, Innovation 25, Technique 25, Pitching 15 out of 100', () => {
    expect(jurorWeightedTotal(criteria(25, 25, 25, 25))).toBe(100);
    expect(jurorWeightedTotal(criteria(0, 0, 0, 0))).toBe(0);
    expect(jurorWeightedTotal(criteria(25, 0, 0, 0))).toBe(35);
    expect(jurorWeightedTotal(criteria(0, 0, 0, 25))).toBe(15);
    // 20 × 1.4 + 18 + 22 + 20 × 0.6
    expect(roundScore(jurorWeightedTotal(criteria(20, 18, 22, 20)))).toBe(80);
  });
});

describe('resolveChallengeScore', () => {
  it('is 0 until a juror scores the team', () => {
    expect(resolveChallengeScore(1, [], null)).toEqual({ juryAverage: null, score: 0, points: 0 });
  });

  it('averages the jurors and applies 20% to challenge 1 and 70% to challenge 2', () => {
    expect(resolveChallengeScore(1, [80, 90], null)).toEqual({
      juryAverage: 85,
      score: 85,
      points: 17,
    });
    expect(resolveChallengeScore(2, [80, 90], null)).toEqual({
      juryAverage: 85,
      score: 85,
      points: 59.5,
    });
  });

  it('uses the administrator override instead of the jury average', () => {
    expect(resolveChallengeScore(2, [80], 50)).toEqual({ juryAverage: 80, score: 50, points: 35 });
    expect(resolveChallengeScore(1, [], 0)).toEqual({ juryAverage: null, score: 0, points: 0 });
  });
});

describe('resolveCtfPoints', () => {
  it('prefers the override, then the automatic points, then 0', () => {
    expect(resolveCtfPoints(7, null)).toBe(7);
    expect(resolveCtfPoints(null, 4)).toBe(4);
    expect(resolveCtfPoints(10, 0)).toBe(0);
    expect(resolveCtfPoints(null, null)).toBe(0);
  });
});

describe('rankByTotal', () => {
  it('sorts by total and gives tied totals the same rank', () => {
    const ranked = rankByTotal([
      { teamName: 'B', total: 70 },
      { teamName: 'A', total: 90 },
      { teamName: 'D', total: 70 },
      { teamName: 'C', total: 10 },
    ]);
    expect(ranked.map((row) => [row.teamName, row.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['D', 2],
      ['C', 4],
    ]);
  });
});
