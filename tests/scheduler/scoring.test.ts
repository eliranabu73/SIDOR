import { scoreCandidate } from '../../src/modules/scheduler/scoring.service';
import type { CandidateSignals } from '../../src/modules/scheduler/types';

function signals(over: Partial<CandidateSignals> = {}): CandidateSignals {
  return {
    availabilityCoverage: 1,
    preferenceScore: 0,
    fairnessScore: 0,
    weeklyHoursDelta: 0,
    weekendShiftCount: 0,
    nightShiftCount: 0,
    isNightShift: false,
    isWeekendShift: false,
    ...over,
  };
}

describe('scoreCandidate', () => {
  it('returns a high score for an ideal candidate', () => {
    const { score } = scoreCandidate(
      signals({ preferenceScore: 10, fairnessScore: -2 }),
    );
    expect(score).toBeGreaterThan(0.85);
  });

  it('punishes zero availability', () => {
    const { score } = scoreCandidate(signals({ availabilityCoverage: 0 }));
    expect(score).toBeLessThan(0.7);
  });

  it('boosts under-scheduled employees via fairness', () => {
    const under = scoreCandidate(signals({ fairnessScore: -3 }));
    const over = scoreCandidate(signals({ fairnessScore: 3 }));
    expect(under.score).toBeGreaterThan(over.score);
  });

  it('penalizes weekend pile-up only on weekend shifts', () => {
    const baseWeekend = scoreCandidate(signals({ isWeekendShift: true, weekendShiftCount: 0 }));
    const heavyWeekend = scoreCandidate(signals({ isWeekendShift: true, weekendShiftCount: 3 }));
    const weekday = scoreCandidate(signals({ isWeekendShift: false, weekendShiftCount: 3 }));
    expect(baseWeekend.score).toBeGreaterThan(heavyWeekend.score);
    // weekday score should not care about weekend pile-up
    expect(weekday.score).toBeGreaterThan(heavyWeekend.score);
  });

  it('breakdown sums approximately to weighted score', () => {
    const { score, breakdown } = scoreCandidate(signals({ preferenceScore: 5 }));
    const sumOfContributions = Object.values(breakdown).reduce((a, b) => a + b, 0);
    // weighted score = sum / sumOfWeights (3.3 by default)
    expect(score).toBeCloseTo(sumOfContributions / 3.3, 5);
  });

  it('clamps signals to safe ranges', () => {
    const insane = scoreCandidate(
      signals({
        availabilityCoverage: 99,
        preferenceScore: -999,
        fairnessScore: 999,
        weeklyHoursDelta: 99999,
      }),
    );
    expect(insane.score).toBeGreaterThanOrEqual(0);
    expect(insane.score).toBeLessThanOrEqual(1);
  });
});
