import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';

/**
 * IL 36-hour Weekly Rest (WS-E).
 *
 * Every employee must have a continuous 36-hour window of rest each week
 * that INCLUDES the employee's declared `weeklyRestDay` (FRI/SAT/SUN).
 *
 * We check the local week containing the candidate shift. The window is
 * computed against all CONFIRMED/PROPOSED shifts for the employee in that
 * week (including the candidate shift). If no 36h gap covers the rest day,
 * the assignment is flagged.
 */

const REST_DAY_LUXON: Record<'FRIDAY' | 'SATURDAY' | 'SUNDAY', number> = {
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

export const weeklyRest36hRule: RuleFn = (ctx): RuleResult => {
  const { shift, employee, existingAssignments } = ctx;

  // weeklyRestDay is non-null in schema (default SATURDAY), but be defensive.
  const restDayName = (employee.weeklyRestDay ?? 'SATURDAY') as
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';
  const restWeekday = REST_DAY_LUXON[restDayName];

  const tz = shift.timezone;
  const shiftStartLocal = DateTime.fromJSDate(shift.startAtUtc, { zone: 'utc' })
    .setZone(tz);

  // Sunday-anchored local week.
  const weekStartLocal = shiftStartLocal.weekday === 7
    ? shiftStartLocal.startOf('day')
    : shiftStartLocal.minus({ days: shiftStartLocal.weekday }).startOf('day');
  const weekEndLocal = weekStartLocal.plus({ days: 7 });

  // Collect employee shifts that touch this week (incl. the candidate).
  const intervals: Array<{ start: DateTime; end: DateTime }> = [];
  const pushIfInWeek = (sUtc: Date, eUtc: Date) => {
    const s = DateTime.fromJSDate(sUtc, { zone: 'utc' }).setZone(tz);
    const e = DateTime.fromJSDate(eUtc, { zone: 'utc' }).setZone(tz);
    if (e <= weekStartLocal || s >= weekEndLocal) return;
    intervals.push({
      start: s < weekStartLocal ? weekStartLocal : s,
      end: e > weekEndLocal ? weekEndLocal : e,
    });
  };

  pushIfInWeek(shift.startAtUtc, shift.endAtUtc);
  for (const a of existingAssignments) {
    if (a.shiftId === shift.id) continue;
    if (a.assignmentStatus === 'CANCELLED' || a.assignmentStatus === 'DECLINED') continue;
    pushIfInWeek(a.shift.startAtUtc, a.shift.endAtUtc);
  }

  // Sort & merge overlapping intervals.
  intervals.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const merged: Array<{ start: DateTime; end: DateTime }> = [];
  for (const it of intervals) {
    const last = merged[merged.length - 1];
    if (last && it.start <= last.end) {
      if (it.end > last.end) last.end = it.end;
    } else {
      merged.push({ ...it });
    }
  }

  // Walk gaps between work intervals (incl. week boundaries).
  const gaps: Array<{ start: DateTime; end: DateTime }> = [];
  let cursor = weekStartLocal;
  for (const w of merged) {
    if (w.start > cursor) gaps.push({ start: cursor, end: w.start });
    cursor = w.end;
  }
  if (cursor < weekEndLocal) gaps.push({ start: cursor, end: weekEndLocal });

  // Find the rest day's local calendar date within this week.
  // restWeekday: 5=Fri, 6=Sat, 7=Sun. weekStart is Sunday (luxon 7).
  // Offset from Sunday → restDay:
  const offsetFromSun: Record<5 | 6 | 7, number> = { 5: 5, 6: 6, 7: 0 };
  const restDayStart = weekStartLocal.plus({
    days: offsetFromSun[restWeekday as 5 | 6 | 7],
  });
  const restDayEnd = restDayStart.plus({ days: 1 });

  // Need a gap ≥ 36h that overlaps the rest day.
  let bestGapHours = 0;
  for (const g of gaps) {
    const overlaps = g.start < restDayEnd && g.end > restDayStart;
    if (!overlaps) continue;
    const hours = g.end.diff(g.start, 'hours').hours;
    if (hours > bestGapHours) bestGapHours = hours;
  }

  if (bestGapHours < 36) {
    return {
      ruleCode: 'WEEKLY_REST_36H',
      status: 'failed',
      severity: 'blocking',
      message: 'אין חלון מנוחה של 36 שעות הכולל את יום המנוחה השבועי.',
      metadata: {
        restDay: restDayName,
        weekStartLocal: weekStartLocal.toISO(),
        bestRestHoursAroundRestDay: Math.round(bestGapHours * 10) / 10,
        requiredHours: 36,
      },
    };
  }

  return {
    ruleCode: 'WEEKLY_REST_36H',
    status: 'passed',
    severity: 'info',
  };
};
