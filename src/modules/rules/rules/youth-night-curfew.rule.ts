import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';

/**
 * IL Youth-Labor Night Curfew (WS-E).
 *
 * Employees with dateOfBirth → age < 18 (at shift start) may not work past:
 *   - 20:00 local on a school day (Sun-Thu)
 *   - 22:00 local on a non-school day (Fri/Sat/vacation)
 *
 * "Vacation" is not modeled in the current schema, so the school-day check
 * uses day-of-week only (Fri+Sat treated as non-school). Failing this rule
 * is HIGH severity.
 */
export const youthNightCurfewRule: RuleFn = (ctx): RuleResult => {
  const { shift, employee } = ctx;
  const dob = employee.dateOfBirth;
  if (!dob) {
    return {
      ruleCode: 'YOUTH_NIGHT_CURFEW',
      status: 'passed',
      severity: 'info',
      message: 'No DOB on file — youth curfew skipped.',
    };
  }

  const shiftStartLocal = DateTime.fromJSDate(shift.startAtUtc, { zone: 'utc' })
    .setZone(shift.timezone);
  const shiftEndLocal = DateTime.fromJSDate(shift.endAtUtc, { zone: 'utc' })
    .setZone(shift.timezone);

  // Age at shift start (years).
  const dobDt = DateTime.fromJSDate(dob, { zone: 'utc' });
  const ageYears = Math.floor(shiftStartLocal.diff(dobDt, 'years').years);
  if (ageYears >= 18) {
    return {
      ruleCode: 'YOUTH_NIGHT_CURFEW',
      status: 'passed',
      severity: 'info',
    };
  }

  // Day-of-week of shift start (luxon: 1=Mon..7=Sun).
  // School days = Sun-Thu (luxon weekday 7,1,2,3,4). Fri=5, Sat=6 → non-school.
  const wd = shiftStartLocal.weekday;
  const isSchoolDay = wd === 7 || wd <= 4;
  const curfewHour = isSchoolDay ? 20 : 22;

  // Compute curfew instant on the local calendar day of the shift START.
  const curfewLocal = shiftStartLocal.set({
    hour: curfewHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  if (shiftEndLocal > curfewLocal) {
    return {
      ruleCode: 'YOUTH_NIGHT_CURFEW',
      status: 'failed',
      severity: 'blocking',
      message: `קטין מתחת לגיל 18 — סוף משמרת חורג מ-${curfewHour}:00 ביום ${isSchoolDay ? 'לימודים' : 'מנוחה'}.`,
      metadata: {
        ageYears,
        curfewLocal: curfewLocal.toISO(),
        shiftEndLocal: shiftEndLocal.toISO(),
        isSchoolDay,
      },
    };
  }

  return {
    ruleCode: 'YOUTH_NIGHT_CURFEW',
    status: 'passed',
    severity: 'info',
  };
};
