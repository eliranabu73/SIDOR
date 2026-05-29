/**
 * Israeli tenure (וותק) utilities — used for vacation accrual, severance,
 * and youth-labor rules.
 *
 * Source: חוק חופשה שנתית, התשי"א-1951 (Annual Vacation Law 1951) as amended
 * by Amendment 15 (2016, effective 2017). Authoritative tier table published
 * by Ministry of Labor at:
 *   https://www.gov.il/he/Departments/Guides/molsa-occupation-law-rights
 *
 * The Amendment 15 (post-2017) entitlement table for a full-time 5-day worker:
 *   Years 1–5    → 12 working days = 16 calendar days
 *   Year 6       → 14 working days = 18 calendar days
 *   Year 7       → 15 working days = 21 calendar days
 *   Years 8–9    → 16 working days = 23 calendar days
 *   Years 10–13  → 17 working days = 24 calendar days
 *   Years 14+    → 20 working days = 28 calendar days
 *
 * We expose the calendar-day count (the consumer-facing number that matches
 * what payroll software like Hilan reports). Number of working days varies
 * with the employee's week structure (5 vs 6 day week) and is left to the
 * payroll layer.
 */

import { DateTime } from 'luxon';

/**
 * Compute seniority in years (float) between hireDate and asOfDate.
 *
 * Returns 0 when hireDate is null. Returns 0 (not negative) when asOfDate
 * precedes hireDate — caller-friendly: a future hire has not started
 * accruing tenure yet, so 0 is the correct "no entitlement" answer.
 *
 * Leap-year safe: uses Luxon's calendar-aware diff in years, which handles
 * Feb 29 correctly (e.g. 2020-02-29 → 2024-02-28 = 3.997 years, not 4.0).
 */
export function computeSeniorityYears(
  hireDate: Date | string | null,
  asOfDate: Date = new Date(),
): number {
  if (hireDate == null) return 0;

  const hire =
    typeof hireDate === 'string'
      ? DateTime.fromISO(hireDate, { zone: 'utc' })
      : DateTime.fromJSDate(hireDate, { zone: 'utc' });
  const asOf = DateTime.fromJSDate(asOfDate, { zone: 'utc' });

  if (!hire.isValid || !asOf.isValid) return 0;
  if (asOf <= hire) return 0;

  // Luxon's diff('years') is calendar-aware (handles leap years correctly).
  const diff = asOf.diff(hire, 'years').years;
  return diff;
}

/**
 * Annual vacation entitlement in calendar days per Israeli Annual Vacation
 * Law (post-2017 Amendment 15 tiers). Input is full years of seniority —
 * fractional years round DOWN (you only get the next tier on your work
 * anniversary, not partway through a year).
 *
 * @param seniorityYears float years of tenure (e.g. 2.7)
 * @returns calendar days of paid vacation per year
 */
export function vacationDaysPerYear(seniorityYears: number): number {
  if (!Number.isFinite(seniorityYears) || seniorityYears < 0) return 16;
  // Tier lookup uses *completed* years — partway through year 6 still pays
  // the year-6 entitlement; you bump to year-7 tier only on the 7th anniv.
  const completedYears = Math.floor(seniorityYears) + 1; // year 1 = 1st year of work

  if (completedYears <= 5) return 16;
  if (completedYears === 6) return 18;
  if (completedYears === 7) return 21;
  if (completedYears <= 9) return 23; // years 8–9
  if (completedYears <= 13) return 24; // years 10–13
  return 28; // years 14+
}
