import type { RuleFn, RuleResult } from '../types';

/**
 * TIME_OFF — hard block. If the employee has an open time-off request
 * (PENDING or APPROVED) whose window overlaps the shift, the assignment is
 * blocked. Requests submitted via the employee share link land in
 * `employee_time_off_requests`; this rule is what makes auto-schedule and
 * manual assignment honor them. REJECTED / CANCELLED requests do not block.
 */
export const timeOffRule: RuleFn = (ctx): RuleResult => {
  const { shift, timeOffRequests } = ctx;

  const blocking = timeOffRequests.find(
    (r) =>
      (r.status === 'PENDING' || r.status === 'APPROVED') &&
      shift.startAtUtc < r.endAtUtc &&
      r.startAtUtc < shift.endAtUtc,
  );

  if (blocking) {
    return {
      ruleCode: 'TIME_OFF_BLOCKED',
      status: 'failed',
      severity: 'blocking',
      message: 'לעובד יש בקשת היעדרות החופפת למשמרת זו.',
      metadata: {
        timeOffRequestId: blocking.id,
        timeOffStatus: blocking.status,
        startAtUtc: blocking.startAtUtc.toISOString(),
        endAtUtc: blocking.endAtUtc.toISOString(),
      },
    };
  }

  return {
    ruleCode: 'TIME_OFF_OK',
    status: 'passed',
    severity: 'info',
  };
};
