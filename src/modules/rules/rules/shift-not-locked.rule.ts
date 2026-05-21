import type { RuleFn, RuleResult } from '../types';

export const shiftNotLockedRule: RuleFn = (ctx): RuleResult => {
  const { activeLockUserId, actingUserId } = ctx;
  if (activeLockUserId && activeLockUserId !== actingUserId) {
    return {
      ruleCode: 'SHIFT_LOCKED',
      status: 'failed',
      severity: 'blocking',
      message: 'This shift is being edited by another user.',
      metadata: { lockedBy: activeLockUserId },
    };
  }
  return {
    ruleCode: 'SHIFT_UNLOCKED',
    status: 'passed',
    severity: 'info',
  };
};
