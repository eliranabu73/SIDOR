import type { RuleFn, RuleResult } from '../types';

export const maxHoursWeekRule: RuleFn = (ctx): RuleResult => {
  const { shift, metrics, rulesSnapshot } = ctx;
  const maxMinutes = rulesSnapshot.maxHoursPerWeek * 60;
  const overtimeMinutes = rulesSnapshot.overtimeAfterWeeklyHours * 60;

  const shiftMinutes = Math.round(
    (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60000,
  );
  const currentMinutes = metrics?.totalScheduledMinutes ?? 0;
  const projected = currentMinutes + shiftMinutes;

  if (projected > maxMinutes) {
    return {
      ruleCode: 'MAX_HOURS_PER_WEEK',
      status: 'failed',
      severity: 'blocking',
      message: 'Assignment would exceed the weekly hour limit.',
      metadata: {
        currentMinutes,
        shiftMinutes,
        projectedMinutes: projected,
        maxMinutes,
      },
    };
  }
  if (projected > overtimeMinutes && rulesSnapshot.allowOvertimeWithWarning) {
    return {
      ruleCode: 'OVERTIME_WEEKLY',
      status: 'failed',
      severity: 'warning',
      message: 'Assignment pushes the employee into weekly overtime.',
      metadata: {
        projectedMinutes: projected,
        overtimeThresholdMinutes: overtimeMinutes,
      },
    };
  }
  return {
    ruleCode: 'MAX_HOURS_PER_WEEK_OK',
    status: 'passed',
    severity: 'info',
  };
};
