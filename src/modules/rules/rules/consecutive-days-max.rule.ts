import type { RuleFn, RuleResult } from '../types';
import { DateTime } from 'luxon';

/**
 * IL Max Consecutive Work Days.
 *
 * An employee may not work more than `maxConsecutiveWorkDays` days in a row
 * without a day off. IL law forbids 7+ consecutive days (would violate the
 * 36h weekly rest requirement). The configurable default is 6.
 *
 * Algorithm: collect all local calendar dates the employee is already
 * scheduled on, add the candidate shift's date, then find the longest
 * consecutive run that includes the candidate date.
 */
export const consecutiveDaysMaxRule: RuleFn = (ctx): RuleResult => {
  const { shift, existingAssignments, rulesSnapshot } = ctx;
  const maxDays = rulesSnapshot.maxConsecutiveWorkDays;

  const tz = shift.timezone;

  // Local date string (yyyy-MM-dd) for the candidate shift.
  const candidateDate = DateTime.fromJSDate(shift.startAtUtc, { zone: 'utc' })
    .setZone(tz)
    .toFormat('yyyy-LL-dd');

  // Collect distinct local dates from existing active assignments.
  const scheduledDates = new Set<string>();
  for (const a of existingAssignments) {
    if (a.shiftId === shift.id) continue;
    if (a.assignmentStatus === 'CANCELLED' || a.assignmentStatus === 'DECLINED') continue;
    const d = DateTime.fromJSDate(a.shift.startAtUtc, { zone: 'utc' })
      .setZone(tz)
      .toFormat('yyyy-LL-dd');
    scheduledDates.add(d);
  }
  scheduledDates.add(candidateDate);

  // Walk backwards and forwards from candidate date to find the run length.
  const candidateDt = DateTime.fromISO(candidateDate, { zone: tz });
  let run = 1;

  for (let i = 1; i <= maxDays; i++) {
    if (scheduledDates.has(candidateDt.minus({ days: i }).toFormat('yyyy-LL-dd'))) run++;
    else break;
  }
  for (let i = 1; i <= maxDays; i++) {
    if (scheduledDates.has(candidateDt.plus({ days: i }).toFormat('yyyy-LL-dd'))) run++;
    else break;
  }

  if (run > maxDays) {
    return {
      ruleCode: 'CONSECUTIVE_DAYS_MAX',
      status: 'failed',
      severity: 'blocking',
      message: `שיבוץ יוצר ${run} ימי עבודה רצופים — מעל המותר (${maxDays}).`,
      metadata: { consecutiveDays: run, maxConsecutiveWorkDays: maxDays, candidateDate },
    };
  }

  return { ruleCode: 'CONSECUTIVE_DAYS_MAX', status: 'passed', severity: 'info' };
};
