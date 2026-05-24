import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';

/**
 * IL Pregnancy Night-Work Restriction (חוק עבודת נשים תשי"ד).
 *
 * From week 20 (month ~5) of pregnancy, an employer MAY NOT assign a
 * pregnant employee to:
 *   - Overtime shifts (handled by max-hours rules)
 *   - Night shifts — defined as any shift ending after 22:00 or starting
 *     before 06:00 local time — without WRITTEN consent + medical certificate.
 *
 * This rule blocks night-shift assignment when:
 *   employee.isPregnant = true  AND  employee.pregnancyWeeks >= 20
 *
 * When isPregnant = true but pregnancyWeeks is not set, a WARNING is emitted
 * (can't confirm which trimester).
 *
 * Night definition here follows the IL statutory window: a shift is
 * "night work" when it overlaps the 22:00–06:00 window.
 */
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 6;
const RESTRICTION_FROM_WEEK = 20;

export const pregnancyNightRule: RuleFn = (ctx): RuleResult => {
  const { shift, employee } = ctx;
  const emp = employee as typeof employee & { isPregnant?: boolean; pregnancyWeeks?: number | null };

  if (!emp.isPregnant) {
    return { ruleCode: 'PREGNANCY_NIGHT', status: 'passed', severity: 'info' };
  }

  const tz = shift.timezone;
  const startLocal = DateTime.fromJSDate(shift.startAtUtc, { zone: 'utc' }).setZone(tz);
  const endLocal = DateTime.fromJSDate(shift.endAtUtc, { zone: 'utc' }).setZone(tz);

  // Is this a night shift? Overlaps 22:00–06:00 local.
  const nightStart = startLocal.set({ hour: NIGHT_START_HOUR, minute: 0, second: 0, millisecond: 0 });
  const nightEnd = startLocal.plus({ days: 1 }).set({ hour: NIGHT_END_HOUR, minute: 0, second: 0, millisecond: 0 });
  const isNightShift = startLocal < nightEnd && endLocal > nightStart;

  if (!isNightShift) {
    return { ruleCode: 'PREGNANCY_NIGHT', status: 'passed', severity: 'info' };
  }

  const weeks = emp.pregnancyWeeks;
  if (weeks == null) {
    return {
      ruleCode: 'PREGNANCY_NIGHT',
      status: 'failed',
      severity: 'warning',
      message: 'עובדת מסומנת כהרה — משמרת לילה דורשת אישור בכתב ואישור רפואי (לא ידוע שבוע הריון).',
      metadata: { isNightShift: true },
    };
  }

  if (weeks >= RESTRICTION_FROM_WEEK) {
    return {
      ruleCode: 'PREGNANCY_NIGHT',
      status: 'failed',
      severity: 'blocking',
      message: `עובדת בהריון (שבוע ${weeks}) — אסור משמרת לילה מחודש 5 ללא הסכמה בכתב ואישור רפואי (חוק עבודת נשים).`,
      metadata: { pregnancyWeeks: weeks, restrictionFromWeek: RESTRICTION_FROM_WEEK, isNightShift: true },
    };
  }

  // Under 20 weeks — warn but don't block.
  return {
    ruleCode: 'PREGNANCY_NIGHT',
    status: 'failed',
    severity: 'warning',
    message: `עובדת הרה (שבוע ${weeks}) — משמרת לילה. מגבלה חוקית תחול משבוע 20.`,
    metadata: { pregnancyWeeks: weeks, restrictionFromWeek: RESTRICTION_FROM_WEEK },
  };
};
