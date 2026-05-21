import type { RuleFn, RuleResult } from '../types';
import { splitShiftIntoLocalDays } from '../../../shared/tz';

export const maxHoursDayRule: RuleFn = (ctx): RuleResult => {
  const { shift, existingAssignments, rulesSnapshot } = ctx;
  const maxMinutes = rulesSnapshot.maxHoursPerDay * 60;
  const overtimeMinutes = rulesSnapshot.overtimeAfterDailyHours * 60;

  // build per-local-day minute totals for the candidate shift
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

    if (dayMinutes > maxMinutes) {
      return {
        ruleCode: 'MAX_HOURS_PER_DAY',
        status: 'failed',
        severity: 'blocking',
        message: 'Assignment would exceed the daily hour limit.',
        metadata: {
          localDate,
          totalMinutes: dayMinutes,
          maxMinutes,
        },
      };
    }
    if (
      dayMinutes > overtimeMinutes &&
      rulesSnapshot.allowOvertimeWithWarning
    ) {
      return {
        ruleCode: 'OVERTIME_DAILY',
        status: 'failed',
        severity: 'warning',
        message: 'Assignment pushes the employee into daily overtime.',
        metadata: {
          localDate,
          totalMinutes: dayMinutes,
          overtimeThresholdMinutes: overtimeMinutes,
        },
      };
    }
  }
  return {
    ruleCode: 'MAX_HOURS_PER_DAY_OK',
    status: 'passed',
    severity: 'info',
  };
};
