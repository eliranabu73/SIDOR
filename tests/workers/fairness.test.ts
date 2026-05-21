import { computeFairnessScore } from '../../src/workers/fairness';

describe('computeFairnessScore', () => {
  it('returns 0 for empty team', () => {
    expect(computeFairnessScore({ employeeMinutes: 0, teamMinutes: [] })).toBe(0);
  });

  it('returns 0 for a single-member team', () => {
    expect(
      computeFairnessScore({ employeeMinutes: 100, teamMinutes: [100] }),
    ).toBe(0);
  });

  it('returns 0 when all team members are equal', () => {
    expect(
      computeFairnessScore({
        employeeMinutes: 200,
        teamMinutes: [200, 200, 200, 200],
      }),
    ).toBe(0);
  });

  it('returns a positive z-score (~+1.41) for the top employee in [10,20,30,40,50]', () => {
    const score = computeFairnessScore({
      employeeMinutes: 50,
      teamMinutes: [10, 20, 30, 40, 50],
    });
    // mean = 30, stdev (population) = sqrt(200) ≈ 14.142, z = (50-30)/14.142 ≈ 1.4142
    expect(score).toBeGreaterThan(1.4);
    expect(score).toBeLessThan(1.43);
  });

  it('clamps extreme positive outliers to +3', () => {
    // With one big outlier in a team of N, max z = sqrt(N-1). N=20 -> ~4.36, clamped to 3.
    const team = Array.from({ length: 19 }, () => 10).concat([100_000]);
    const score = computeFairnessScore({
      employeeMinutes: 100_000,
      teamMinutes: team,
    });
    expect(score).toBe(3);
  });

  it('clamps extreme negative outliers to -3', () => {
    const team = [0].concat(Array.from({ length: 19 }, () => 10_000));
    const score = computeFairnessScore({
      employeeMinutes: 0,
      teamMinutes: team,
    });
    expect(score).toBe(-3);
  });
});
