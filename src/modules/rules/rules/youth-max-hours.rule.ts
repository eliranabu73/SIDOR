import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';
import { splitShiftIntoLocalDays } from '../../../shared/tz';

/**
 * IL Youth-Labor Max Hours (WS-E).
 *
 * Employees with dateOfBirth → age < 18 may not exceed:
 *   - 8 hours per local day
 *   - 40 hours per week
 *
 * Failing either limit is HIGH severity.
 */
const MAX_DAILY_MINUTES = 8 * 60;
const MAX_WEEKLY_MINUTES = 40 * 60;

export const youthMaxHoursRule: RuleFn = (ctx): RuleResult => {
  const { shift, employee, existingAssignments } = ctx;
  const dob = employee.dateOfBirth;
  if (!dob) {
    return {
      ruleCode: 'YOUTH_MAX_HOURS',
      status: 'passed',
      severity: 'info',
      message: 'No DOB on file — youth max-hours skipped.',
    };
  }

  const shiftStartLocal = DateTime.fromJSDate(shift.startAtUtc, { zone: 'utc' })
    .setZone(shift.timezone);
  const ageYears = Math.floor(
    shiftStartLocal.diff(DateTime.fromJSDate(dob, { zone: 'utc' }), 'years').years,
  );
  if (ageYears >= 18) {
    return {
      ruleCode: 'YOUTH_MAX_HOURS',
      status: 'passed',
      severity: 'info',
    };
  }

  // ---- Daily cap (8h) ----
  const candidateSegments = splitShiftIntoLocalDays(
    shift.startAtUtc,
    shift.endAtUtc,
    shift.timezone,
  );

  for (const seg of candidateSegments) {
    const localDate = seg.startLocal.toFormat('yyyy-LL-dd');
    let dayMinutes = seg.durationMinutes;

    for (const a of existingAssignments) {
      if (a.shiftId === shift.id) continue;
      if (a.assignmentStatus === 'CANCELLED' || a.assignmentStatus === 'DECLINED') continue;
      const otherSegs = splitShiftIntoLocalDays(
        a.shift.startAtUtc,
        a.shift.endAtUtc,
        a.shift.timezone,
      );
      for (const os of otherSegs) {
        if (os.startLocal.toFormat('yyyy-LL-dd') === localDate) {
          dayMinutes += os.durationMinutes;
        }
      }
    }

    if (dayMinutes > MAX_DAILY_MINUTES) {
      return {
        ruleCode: 'YOUTH_MAX_HOURS_DAY',
        status: 'failed',
        severity: 'blocking',
        message: 'קטין מתחת לגיל 18 — חריגה ממכסת 8 שעות ביום.',
        metadata: {
          ageYears,
          localDate,
          totalMinutes: dayMinutes,
          maxMinutes: MAX_DAILY_MINUTES,
        },
      };
    }
  }

  // ---- Weekly cap (40h) — Sunday-start ISO week per IL convention ----
  const shiftMinutes = Math.round(
    (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60000,
  );
  // Sunday-anchored week containing the shift start (local).
  const weekStartLocal = shiftStartLocal.weekday === 7
    ? shiftStartLocal.startOf('day')
    : shiftStartLocal.minus({ days: shiftStartLocal.weekday }).startOf('day');
  const weekEndLocal = weekStartLocal.plus({ days: 7 });

  let weekMinutes = shiftMinutes;
  for (const a of existingAssignments) {
    if (a.shiftId === shift.id) continue;
    if (a.assignmentStatus === 'CANCELLED' || a.assignmentStatus === 'DECLINED') continue;
    const otherStart = DateTime.fromJSDate(a.shift.startAtUtc, { zone: 'utc' })
      .setZone(a.shift.timezone);
    if (otherStart >= weekStartLocal && otherStart < weekEndLocal) {
      const m = Math.round(
        (a.shift.endAtUtc.getTime() - a.shift.startAtUtc.getTime()) / 60000,
      );
      weekMinutes += m;
    }
  }

  if (weekMinutes > MAX_WEEKLY_MINUTES) {
    return {
      ruleCode: 'YOUTH_MAX_HOURS_WEEK',
      status: 'failed',
      severity: 'blocking',
      message: 'קטין מתחת לגיל 18 — חריגה ממכסת 40 שעות בשבוע.',
      metadata: {
        ageYears,
        weekStartLocal: weekStartLocal.toISO(),
        projectedMinutes: weekMinutes,
        maxMinutes: MAX_WEEKLY_MINUTES,
      },
    };
  }

  return {
    ruleCode: 'YOUTH_MAX_HOURS',
    status: 'passed',
    severity: 'info',
  };
};
