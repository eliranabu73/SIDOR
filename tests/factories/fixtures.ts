import type {
  Employee,
  EmployeeRole,
  EmployeeAvailabilityRule,
  EmployeeScheduleMetrics,
  Shift,
  ShiftAssignment,
} from '@prisma/client';
import type {
  EmployeeWithRoles,
  RulesSnapshot,
  ValidationContext,
} from '../../src/modules/rules/types';
import { SYSTEM_DEFAULT_RULES } from '../../src/modules/rules/types';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOC_ID = '00000000-0000-0000-0000-000000000002';
const EMP_ID = '00000000-0000-0000-0000-000000000003';
const ROLE_ID = '00000000-0000-0000-0000-000000000004';
const SHIFT_ID = '00000000-0000-0000-0000-000000000005';

let counter = 100;
const uid = () =>
  `00000000-0000-0000-0000-${(++counter).toString().padStart(12, '0')}`;

export function makeEmployee(overrides: Partial<Employee> = {}): EmployeeWithRoles {
  return {
    id: EMP_ID,
    organizationId: ORG_ID,
    fullName: 'Test Employee',
    email: 'test@example.com',
    phone: null,
    employmentType: 'FULL_TIME',
    defaultLocationId: LOC_ID,
    defaultTimezone: 'Asia/Jerusalem',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [],
    ...overrides,
  } as EmployeeWithRoles;
}

export function makeEmployeeRole(
  overrides: Partial<EmployeeRole> = {},
): EmployeeRole {
  return {
    id: uid(),
    employeeId: EMP_ID,
    roleId: ROLE_ID,
    skillLevel: 1,
    isPrimary: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeShift(overrides: Partial<Shift> = {}): Shift {
  const start = new Date('2026-05-25T06:00:00Z'); // Mon
  const end = new Date('2026-05-25T14:00:00Z');
  return {
    id: SHIFT_ID,
    organizationId: ORG_ID,
    locationId: LOC_ID,
    departmentId: null,
    roleId: ROLE_ID,
    templateId: null,
    scheduleId: null,
    startAtUtc: start,
    endAtUtc: end,
    timezone: 'Asia/Jerusalem',
    localStartDate: start,
    localEndDate: end,
    requiredEmployeeCount: 1,
    status: 'PLANNED',
    isOpenShift: false,
    version: 1,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeAvailability(
  overrides: Partial<EmployeeAvailabilityRule> = {},
): EmployeeAvailabilityRule {
  return {
    id: uid(),
    employeeId: EMP_ID,
    dayOfWeek: 1, // Monday
    startLocalTime: '06:00:00',
    endLocalTime: '23:00:00',
    availabilityType: 'AVAILABLE',
    timezone: 'Asia/Jerusalem',
    validFrom: null,
    validUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeAssignment(
  overrides: Partial<ShiftAssignment> & { shift?: Partial<Shift> } = {},
): ShiftAssignment & { shift: Shift } {
  const { shift: shiftOverride, ...rest } = overrides;
  return {
    id: uid(),
    shiftId: shiftOverride?.id ?? uid(),
    employeeId: EMP_ID,
    assignmentStatus: 'CONFIRMED',
    source: 'MANUAL',
    assignedByUserId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
    shift: makeShift({ ...shiftOverride, id: shiftOverride?.id ?? uid() }),
  };
}

export function makeMetrics(
  overrides: Partial<EmployeeScheduleMetrics> = {},
): EmployeeScheduleMetrics {
  return {
    id: uid(),
    organizationId: ORG_ID,
    scheduleId: null,
    employeeId: EMP_ID,
    weekStartDate: new Date('2026-05-24'),
    totalScheduledMinutes: 0,
    totalPaidMinutes: 0,
    shiftCount: 0,
    consecutiveWorkDays: 0,
    lastShiftEndAtUtc: null,
    nextShiftStartAtUtc: null,
    weekendShiftCount: 0,
    nightShiftCount: 0,
    morningShiftCount: 0,
    eveningShiftCount: 0,
    fairnessScore: 0,
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  const shift = overrides.shift ?? makeShift();
  const employee =
    overrides.employee ?? makeEmployee({}); // roles defaults to []
  return {
    shift,
    employee,
    availabilityRules: overrides.availabilityRules ?? [makeAvailability()],
    existingAssignments: overrides.existingAssignments ?? [],
    rulesSnapshot: overrides.rulesSnapshot ?? { ...SYSTEM_DEFAULT_RULES },
    metrics: overrides.metrics ?? makeMetrics(),
    activeLockUserId: overrides.activeLockUserId ?? null,
    actingUserId: overrides.actingUserId ?? 'user-1',
  };
}

export const IDS = { ORG_ID, LOC_ID, EMP_ID, ROLE_ID, SHIFT_ID };
