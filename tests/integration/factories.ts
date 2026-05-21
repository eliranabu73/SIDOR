/**
 * Integration-test factories.
 *
 * Each factory function inserts one or more rows using the real Prisma client
 * and returns the created IDs / objects. Each test should call `seedHappyShift`
 * (or individual helpers) with a fresh, unique orgId so tests are isolated
 * without truncation.
 *
 * Monday 2026-05-25 is used as the canonical "test week Monday".
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Generates a fresh UUID (just an alias for readability). */
export const uuid = (): string => randomUUID();

/**
 * Returns a Date whose UTC components match the supplied ISO-like string so
 * Prisma Date fields store the intended calendar date regardless of local TZ.
 *
 * e.g. localDate('2026-05-25') → 2026-05-25 00:00:00 UTC
 */
export function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// ─── individual row factories ─────────────────────────────────────────────────

export async function createOrg(
  prisma: PrismaClient,
  opts: { id?: string; laborRulesJsonb?: object } = {},
) {
  return prisma.organization.create({
    data: {
      id: opts.id ?? uuid(),
      name: `Test Org ${Date.now()}`,
      defaultTimezone: 'UTC',
      weekStartDay: 0,
      laborRulesJsonb: opts.laborRulesJsonb ?? {},
    },
  });
}

export async function createLocation(
  prisma: PrismaClient,
  organizationId: string,
  opts: { id?: string; laborRulesJsonb?: object } = {},
) {
  return prisma.location.create({
    data: {
      id: opts.id ?? uuid(),
      organizationId,
      name: `Test Location ${Date.now()}`,
      timezone: 'UTC',
      laborRulesJsonb: opts.laborRulesJsonb ?? {},
      isActive: true,
    },
  });
}

export async function createRole(
  prisma: PrismaClient,
  organizationId: string,
  opts: { id?: string; name?: string } = {},
) {
  return prisma.role.create({
    data: {
      id: opts.id ?? uuid(),
      organizationId,
      name: opts.name ?? `Role-${Date.now()}`,
    },
  });
}

export async function createEmployee(
  prisma: PrismaClient,
  organizationId: string,
  opts: {
    id?: string;
    defaultLocationId?: string;
    isActive?: boolean;
    roleIds?: string[];
  } = {},
) {
  const employee = await prisma.employee.create({
    data: {
      id: opts.id ?? uuid(),
      organizationId,
      fullName: `Employee ${Date.now()}`,
      email: `emp-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      isActive: opts.isActive ?? true,
      defaultLocationId: opts.defaultLocationId ?? null,
      defaultTimezone: 'UTC',
    },
  });

  for (const roleId of opts.roleIds ?? []) {
    await prisma.employeeRole.create({
      data: {
        employeeId: employee.id,
        roleId,
        skillLevel: 1,
        isPrimary: false,
      },
    });
  }

  return employee;
}

/**
 * Creates a single AVAILABLE rule that covers the full Mon 00:00–23:59 UTC.
 * dayOfWeek follows 0=Sun convention used throughout the codebase.
 * Monday = 1.
 */
export async function createAvailabilityRule(
  prisma: PrismaClient,
  employeeId: string,
  opts: {
    dayOfWeek?: number;
    startLocalTime?: string;
    endLocalTime?: string;
    availabilityType?: 'AVAILABLE' | 'PREFERRED' | 'UNAVAILABLE';
  } = {},
) {
  return prisma.employeeAvailabilityRule.create({
    data: {
      employeeId,
      dayOfWeek: opts.dayOfWeek ?? 1, // Monday
      startLocalTime: opts.startLocalTime ?? '00:00:00',
      endLocalTime: opts.endLocalTime ?? '23:59:00',
      availabilityType: opts.availabilityType ?? 'AVAILABLE',
      timezone: 'UTC',
    },
  });
}

export async function createShift(
  prisma: PrismaClient,
  organizationId: string,
  opts: {
    id?: string;
    locationId?: string;
    roleId?: string;
    scheduleId?: string;
    startAtUtc?: Date;
    endAtUtc?: Date;
    timezone?: string;
    version?: number;
  } = {},
) {
  const startAtUtc = opts.startAtUtc ?? new Date('2026-05-25T06:00:00.000Z');
  const endAtUtc = opts.endAtUtc ?? new Date('2026-05-25T14:00:00.000Z');
  const timezone = opts.timezone ?? 'UTC';

  return prisma.shift.create({
    data: {
      id: opts.id ?? uuid(),
      organizationId,
      locationId: opts.locationId ?? null,
      roleId: opts.roleId ?? null,
      scheduleId: opts.scheduleId ?? null,
      startAtUtc,
      endAtUtc,
      timezone,
      localStartDate: localDate('2026-05-25'),
      localEndDate: localDate('2026-05-25'),
      requiredEmployeeCount: 1,
      status: 'PLANNED',
      isOpenShift: false,
      version: opts.version ?? 1,
    },
  });
}

// ─── composite seed ───────────────────────────────────────────────────────────

export interface HappySeedResult {
  prisma: PrismaClient;
  orgId: string;
  locationId: string;
  roleId: string;
  employeeId: string;
  shiftId: string;
  /** Mon 2026-05-25 06:00–14:00 UTC → 480 minutes, morning classification */
  shiftMinutes: number;
  /** UTC Mon = 2026-05-25T00:00:00Z (week start in UTC, Luxon startOf('week') with UTC tz) */
  weekStartDate: Date;
}

/**
 * Seeds a minimal but complete fixture set for a successful assign:
 *   org → location (same TZ=UTC) → role → employee (with that role)
 *   → availability rule fully covering Mon 06:00–14:00 UTC
 *   → shift Mon 2026-05-25 06:00–14:00 UTC
 *
 * Uses UTC timezone throughout so UTC start-of-week == Mon 2026-05-25T00:00:00Z
 * and the shift's 06:00 local hour → morning classification.
 *
 * `laborRulesJsonb` on the org enables allowOvertimeWithWarning so a 10-hour
 * shift produces a WARNING (used by the WARNINGS_REQUIRE_ACK test).
 */
export async function seedHappyShift(
  prisma: PrismaClient,
  opts: {
    shiftId?: string;
    shiftStart?: Date;
    shiftEnd?: Date;
    /** override orgId – useful when you need the same org for multiple seeds */
    orgId?: string;
    /** pass a roleId to bind the shift to that role; employee will NOT hold it (CONSTRAINTS test) */
    roleIdForShift?: string;
    /** set to false to create employee WITHOUT the shift's role */
    grantRoleToEmployee?: boolean;
  } = {},
): Promise<HappySeedResult> {
  const grantRole = opts.grantRoleToEmployee ?? true;

  const orgId = opts.orgId ?? uuid();

  // Only create org if orgId was not externally provided.
  const orgExists = opts.orgId !== undefined
    ? await prisma.organization.findUnique({ where: { id: orgId } })
    : null;

  if (!orgExists) {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: `Test Org ${orgId.slice(0, 8)}`,
        defaultTimezone: 'UTC',
        weekStartDay: 0,
        laborRulesJsonb: {
          allowOvertimeWithWarning: true,
          overtimeAfterDailyHours: 8,
          maxHoursPerDay: 12,
          maxHoursPerWeek: 45,
          minRestHoursBetweenShifts: 8,
          requireRoleMatch: true,
          requireAvailability: true,
        },
      },
    });
  }

  const location = await prisma.location.create({
    data: {
      organizationId: orgId,
      name: `Loc-${Date.now()}`,
      timezone: 'UTC',
      laborRulesJsonb: {},
      isActive: true,
    },
  });

  const role = await prisma.role.create({
    data: {
      organizationId: orgId,
      name: `Role-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });

  const employee = await prisma.employee.create({
    data: {
      organizationId: orgId,
      fullName: `Worker ${Date.now()}`,
      email: `w-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      isActive: true,
      defaultLocationId: location.id,
      defaultTimezone: 'UTC',
    },
  });

  if (grantRole) {
    await prisma.employeeRole.create({
      data: {
        employeeId: employee.id,
        roleId: opts.roleIdForShift ?? role.id,
        skillLevel: 1,
        isPrimary: true,
      },
    });
  }

  // Availability: full Mon 00:00–23:59 UTC (dayOfWeek 1 = Monday in 0=Sun scheme)
  await prisma.employeeAvailabilityRule.create({
    data: {
      employeeId: employee.id,
      dayOfWeek: 1, // Monday
      startLocalTime: '00:00:00',
      endLocalTime: '23:59:00',
      availabilityType: 'AVAILABLE',
      timezone: 'UTC',
    },
  });

  const shiftStart = opts.shiftStart ?? new Date('2026-05-25T06:00:00.000Z');
  const shiftEnd = opts.shiftEnd ?? new Date('2026-05-25T14:00:00.000Z');
  const shiftMinutes = Math.round((shiftEnd.getTime() - shiftStart.getTime()) / 60000);

  const shift = await prisma.shift.create({
    data: {
      id: opts.shiftId ?? uuid(),
      organizationId: orgId,
      locationId: location.id,
      roleId: opts.roleIdForShift ?? role.id,
      startAtUtc: shiftStart,
      endAtUtc: shiftEnd,
      timezone: 'UTC',
      localStartDate: localDate('2026-05-25'),
      localEndDate: localDate('2026-05-25'),
      requiredEmployeeCount: 1,
      status: 'PLANNED',
      isOpenShift: false,
      version: 1,
    },
  });

  // Luxon in UTC: startOf('week') for 2026-05-25 (Monday) → 2026-05-25T00:00:00Z
  const weekStartDate = new Date('2026-05-25T00:00:00.000Z');

  return {
    prisma,
    orgId,
    locationId: location.id,
    roleId: role.id,
    employeeId: employee.id,
    shiftId: shift.id,
    shiftMinutes,
    weekStartDate,
  };
}
