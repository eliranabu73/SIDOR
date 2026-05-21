import type { RuleFn, RuleResult } from '../types';

export const minRestRule: RuleFn = (ctx): RuleResult => {
  const { shift, existingAssignments, rulesSnapshot } = ctx;
  const minRestMs = rulesSnapshot.minRestHoursBetweenShifts * 3600 * 1000;

  // closest prior shift ending before this one starts
  let closestGapMs = Infinity;
  let neighborShiftId: string | null = null;

  for (const a of existingAssignments) {
    if (a.shiftId === shift.id) continue;
    if (a.assignmentStatus === 'CANCELLED' || a.assignmentStatus === 'DECLINED') continue;
    const other = a.shift;
    // gap = how far apart the two non-overlapping shifts are
    let gap: number;
    if (other.endAtUtc <= shift.startAtUtc) {
      gap = shift.startAtUtc.getTime() - other.endAtUtc.getTime();
    } else if (other.startAtUtc >= shift.endAtUtc) {
      gap = other.startAtUtc.getTime() - shift.endAtUtc.getTime();
    } else {
      // overlap — overlapRule handles it; ignore here
      continue;
    }
    if (gap < closestGapMs) {
      closestGapMs = gap;
      neighborShiftId = other.id;
    }
  }

  if (closestGapMs < minRestMs) {
    return {
      ruleCode: 'MIN_REST_BETWEEN_SHIFTS',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee does not have the required rest period between shifts.',
      metadata: {
        requiredRestHours: rulesSnapshot.minRestHoursBetweenShifts,
        actualRestHours: closestGapMs / 3600 / 1000,
        neighborShiftId,
      },
    };
  }
  return {
    ruleCode: 'MIN_REST_OK',
    status: 'passed',
    severity: 'info',
  };
};
