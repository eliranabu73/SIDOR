import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';

/**
 * IL Youth-Labor Night Curfew (חוק עבודת נוער).
 *
 * Age < 16: NO work past 20:00 on ANY day (school or non-school).
 * Age 16–17: NO work past:
 *   - 20:00 on school days (Sun-Thu)
 *   - 22:00 on non-school days (Fri/Sat)
 *
 * Failing this rule is HIGH (blocking) severity.
 * Source: חוק עבודת נוער, תשי"ג-1953, סעיף 25
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

  const dobDt = DateTime.fromJSDate(dob, { zone: 'utc' });
  const ageYears = Math.floor(shiftStartLocal.diff(dobDt, 'years').years);

  if (ageYears >= 18) {
    return { ruleCode: 'YOUTH_NIGHT_CURFEW', status: 'passed', severity: 'info' };
  }

  // Day-of-week (Luxon: 1=Mon..7=Sun). School days = Sun(7)+Mon-Thu(1-4).
  const wd = shiftStartLocal.weekday;
  const isSchoolDay = wd === 7 || wd <= 4;

  // Under 16: 20:00 curfew every day (stricter than 16-17).
  // 16-17: 20:00 on school days, 22:00 on Fri/Sat.
  const curfewHour = (ageYears < 16 || isSchoolDay) ? 20 : 22;

  const curfewLocal = shiftStartLocal.set({
    hour: curfewHour, minute: 0, second: 0, millisecond: 0,
  });

  if (shiftEndLocal > curfewLocal) {
    const ageGroup = ageYears < 16 ? 'מתחת לגיל 16' : 'גיל 16–17';
    const dayType = isSchoolDay ? 'לימודים' : 'מנוחה';
    return {
      ruleCode: 'YOUTH_NIGHT_CURFEW',
      status: 'failed',
      severity: 'blocking',
      message: `קטין (${ageGroup}) — סוף משמרת חורג מ-${curfewHour}:00 ביום ${dayType}.`,
      metadata: {
        ageYears,
        under16: ageYears < 16,
        curfewHour,
        isSchoolDay,
        curfewLocal: curfewLocal.toISO(),
        shiftEndLocal: shiftEndLocal.toISO(),
      },
    };
  }

  return { ruleCode: 'YOUTH_NIGHT_CURFEW', status: 'passed', severity: 'info' };
};
