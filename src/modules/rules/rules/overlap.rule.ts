import type { RuleFn, RuleResult } from '../types';
import { intervalsOverlap } from '../../../shared/tz';

const ACTIVE_STATUSES = new Set(['PROPOSED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']);

export const overlapRule: RuleFn = (ctx): RuleResult => {
  const { shift, existingAssignments } = ctx;
  const conflicts = existingAssignments.filter((a) => {
    if (a.shiftId === shift.id) return false;
    if (!ACTIVE_STATUSES.has(a.assignmentStatus)) return false;
    return intervalsOverlap(
      shift.startAtUtc,
      shift.endAtUtc,
      a.shift.startAtUtc,
      a.shift.endAtUtc,
    );
  });

  if (conflicts.length > 0) {
    return {
      ruleCode: 'SHIFT_OVERLAP',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee is already assigned to an overlapping shift.',
      metadata: {
        conflictingShiftIds: conflicts.map((c) => c.shiftId),
      },
    };
  }
  return {
    ruleCode: 'NO_OVERLAP',
    status: 'passed',
    severity: 'info',
  };
};
