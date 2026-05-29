import { computeSeniorityYears, vacationDaysPerYear } from '../../src/shared/tenure';

describe('computeSeniorityYears', () => {
  it('returns 0 when hireDate is null', () => {
    expect(computeSeniorityYears(null)).toBe(0);
  });

  it('returns 0 when asOfDate is before hireDate (future hire)', () => {
    const hire = new Date('2026-06-01T00:00:00Z');
    const asOf = new Date('2026-01-01T00:00:00Z');
    expect(computeSeniorityYears(hire, asOf)).toBe(0);
  });

  it('returns 0 when asOfDate equals hireDate', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    expect(computeSeniorityYears(d, d)).toBe(0);
  });

  it('computes ~1 year accurately', () => {
    const hire = new Date('2023-01-01T00:00:00Z');
    const asOf = new Date('2024-01-01T00:00:00Z');
    expect(computeSeniorityYears(hire, asOf)).toBeCloseTo(1, 5);
  });

  it('accepts ISO string for hireDate', () => {
    expect(computeSeniorityYears('2023-01-01', new Date('2024-01-01T00:00:00Z')))
      .toBeCloseTo(1, 5);
  });

  it('leap-year edge: 2020-02-29 → 2024-02-28 is < 4 years', () => {
    const hire = new Date('2020-02-29T00:00:00Z');
    const asOf = new Date('2024-02-28T00:00:00Z');
    const years = computeSeniorityYears(hire, asOf);
    expect(years).toBeLessThan(4);
    expect(years).toBeGreaterThan(3.99);
  });

  it('leap-year edge: 2020-02-29 → 2024-02-29 is exactly 4 years', () => {
    const hire = new Date('2020-02-29T00:00:00Z');
    const asOf = new Date('2024-02-29T00:00:00Z');
    expect(computeSeniorityYears(hire, asOf)).toBeCloseTo(4, 5);
  });
});

describe('vacationDaysPerYear (Israeli Annual Vacation Law, post-2017 tiers)', () => {
  it('null hireDate → 0 years → 16 days', () => {
    expect(vacationDaysPerYear(computeSeniorityYears(null))).toBe(16);
  });

  it('brand-new hire (0 years) → 16 days', () => {
    expect(vacationDaysPerYear(0)).toBe(16);
  });

  it('mid-tier (2.5 years) → still 16 days', () => {
    expect(vacationDaysPerYear(2.5)).toBe(16);
  });

  // Boundary 5 → 6 (year 5 vs year 6)
  it('just under 5 years (4.99) → 16 days', () => {
    expect(vacationDaysPerYear(4.99)).toBe(16);
  });
  it('exactly 5 years → 18 days (entering year 6)', () => {
    expect(vacationDaysPerYear(5)).toBe(18);
  });

  // Boundary 6 → 7
  it('5.5 years → 18 days', () => {
    expect(vacationDaysPerYear(5.5)).toBe(18);
  });
  it('exactly 6 years → 21 days (entering year 7)', () => {
    expect(vacationDaysPerYear(6)).toBe(21);
  });

  // Boundary 7 → 8
  it('exactly 7 years → 23 days (entering year 8)', () => {
    expect(vacationDaysPerYear(7)).toBe(23);
  });
  it('8.5 years → 23 days (mid year 9)', () => {
    expect(vacationDaysPerYear(8.5)).toBe(23);
  });

  // Boundary 9 → 10
  it('exactly 9 years → 24 days (entering year 10)', () => {
    expect(vacationDaysPerYear(9)).toBe(24);
  });
  it('12 years → 24 days', () => {
    expect(vacationDaysPerYear(12)).toBe(24);
  });

  // Boundary 13 → 14
  it('exactly 13 years → 28 days (entering year 14)', () => {
    expect(vacationDaysPerYear(13)).toBe(28);
  });
  it('25 years → 28 days (top tier)', () => {
    expect(vacationDaysPerYear(25)).toBe(28);
  });

  it('negative / NaN seniority → defaults to 16 days', () => {
    expect(vacationDaysPerYear(-1)).toBe(16);
    expect(vacationDaysPerYear(Number.NaN)).toBe(16);
  });
});
