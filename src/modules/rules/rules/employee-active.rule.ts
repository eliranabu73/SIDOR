import type { RuleFn, RuleResult } from '../types';

export const employeeActiveRule: RuleFn = (ctx): RuleResult => {
  const { employee, shift } = ctx;
  if (employee.organizationId !== shift.organizationId) {
    return {
      ruleCode: 'EMPLOYEE_WRONG_ORG',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee belongs to a different organization than the shift.',
    };
  }
  if (!employee.isActive) {
    return {
      ruleCode: 'EMPLOYEE_INACTIVE',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee is not active.',
    };
  }
  return {
    ruleCode: 'EMPLOYEE_ACTIVE',
    status: 'passed',
    severity: 'info',
  };
};
