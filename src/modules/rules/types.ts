import type {
  Shift,
  Employee,
  EmployeeRole,
  EmployeeAvailabilityRule,
  ShiftAssignment,
  EmployeeScheduleMetrics,
} from '@prisma/client';

export type Severity = 'info' | 'warning' | 'blocking';

export interface RulesSnapshot {
  maxHoursPerDay: number;
  maxHoursPerWeek: number;
  minRestHoursBetweenShifts: number;
  maxConsecutiveWorkDays: number;
  overtimeAfterDailyHours: number;
  overtimeAfterWeeklyHours: number;
  requireRoleMatch: boolean;
  requireAvailability: boolean;
  allowOvertimeWithWarning: boolean;
}

export const SYSTEM_DEFAULT_RULES: RulesSnapshot = {
  maxHoursPerDay: 12,
  maxHoursPerWeek: 45,
  minRestHoursBetweenShifts: 8,
  maxConsecutiveWorkDays: 6,
  overtimeAfterDailyHours: 8,
  overtimeAfterWeeklyHours: 42,
  requireRoleMatch: true,
  requireAvailability: true,
  allowOvertimeWithWarning: true,
};

export interface EmployeeWithRoles extends Employee {
  roles: EmployeeRole[];
}

export interface ValidationContext {
  shift: Shift;
  employee: EmployeeWithRoles;
  availabilityRules: EmployeeAvailabilityRule[];
  existingAssignments: Array<ShiftAssignment & { shift: Shift }>;
  rulesSnapshot: RulesSnapshot;
  metrics: EmployeeScheduleMetrics | null;
  activeLockUserId: string | null;
  actingUserId: string;
}

export interface RuleResult {
  ruleCode: string;
  status: 'passed' | 'failed';
  severity: Severity;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type RuleFn = (ctx: ValidationContext) => Promise<RuleResult> | RuleResult;

export type ValidationOutcome = 'allowed' | 'allowed_with_warnings' | 'blocked';

export interface ValidationResult {
  outcome: ValidationOutcome;
  results: RuleResult[];
  blocking: RuleResult[];
  warnings: RuleResult[];
}
