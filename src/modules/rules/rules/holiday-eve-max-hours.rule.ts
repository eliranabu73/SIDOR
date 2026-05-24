import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';

/**
 * IL Holiday Eve / Erev Shabbat Max Hours.
 *
 * Per חוק שעות עבודה ומנוחה and collective agreements:
 *   - 6-day workweek locations: Friday = max 7 work hours.
 *   - 5-day workweek locations: max 8 hours on erev Shabbat.
 *
 * We conservatively enforce the stricter 7-hour limit on Fridays
 * (weekday 5 in Luxon, where Mon=1..Sun=7). For actual Jewish holiday
 * eves (erev Rosh Hashana, erev Yom Kippur, etc.) the same 7-hour cap
 * applies but requires a Jewish holiday calendar (TODO: integrate
 * `jewish-calendar` package or store holiday dates per org).
 *
 * Non-Jewish employees: same rule applies when their weekly rest day
 * is FRIDAY (i.e., erev Shabbat is Thursday for Muslims). Currently
 * only Friday is enforced — extend via `weeklyRestDay` when needed.
 */

const EREV_SHABBAT_MAX_HOURS = 7;
const EREV_SHABBAT_MAX_MINUTES = EREV_SHABBAT_MAX_HOURS * 60;

export const holidayEveMaxHoursRule: RuleFn = (ctx): RuleResult => {
  const { shift } = ctx;

  const startLocal = DateTime.fromJSDate(shift.startAtUtc, { zone: 'utc' }).setZone(shift.timezone);

  // Luxon: 5 = Friday
  if (startLocal.weekday !== 5) {
    return { ruleCode: 'HOLIDAY_EVE_MAX_HOURS', status: 'passed', severity: 'info' };
  }

  const shiftMinutes = Math.round(
    (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60000,
  );

  if (shiftMinutes > EREV_SHABBAT_MAX_MINUTES) {
    const actualHours = (shiftMinutes / 60).toFixed(1);
    return {
      ruleCode: 'HOLIDAY_EVE_MAX_HOURS',
      status: 'failed',
      severity: 'warning',
      message: `ערב שבת — משמרת ${actualHours} שעות חורגת מהמותר (${EREV_SHABBAT_MAX_HOURS} שעות לפי חוק שעות עבודה ומנוחה).`,
      metadata: {
        shiftMinutes,
        maxMinutes: EREV_SHABBAT_MAX_MINUTES,
        dayOfWeek: 'Friday',
      },
    };
  }

  return { ruleCode: 'HOLIDAY_EVE_MAX_HOURS', status: 'passed', severity: 'info' };
};
