import type { RuleFn, RuleResult } from '../types';

export const roleMatchRule: RuleFn = (ctx): RuleResult => {
  const { shift, employee, rulesSnapshot } = ctx;
  if (!rulesSnapshot.requireRoleMatch || !shift.roleId) {
    return {
      ruleCode: 'ROLE_MATCH',
      status: 'passed',
      severity: 'info',
      message: 'Role check skipped.',
    };
  }
  const holds = employee.roles.some((r) => r.roleId === shift.roleId);
  if (!holds) {
    return {
      ruleCode: 'ROLE_NOT_HELD',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee does not hold the required role for this shift.',
      metadata: { requiredRoleId: shift.roleId },
    };
  }
  return {
    ruleCode: 'ROLE_MATCH',
    status: 'passed',
    severity: 'info',
  };
};
