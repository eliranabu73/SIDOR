/**
 * Integration test suite for assignments.service.ts
 *
 * Connects to the real Postgres test schema (TEST_DATABASE_URL).
 * Each test seeds its own org so rows are fully isolated without any truncation.
 * The in-memory Redis singleton is reset before every test to clear soft locks.
 *
 * Run with:
 *   npx jest --config jest.integration.config.ts
 */

import { PrismaClient } from '@prisma/client';
import { applyAssignment, validateOnly } from '../../src/modules/assignments/assignments.service';
import { LocksService } from '../../src/modules/locks/locks.service';
import { __resetRedis } from '../../src/modules/locks/redis';
import { ConflictError, ValidationFailedError } from '../../src/shared/errors';
import {
  seedHappyShift,
  createShift,
  localDate,
  uuid,
} from './factories';

// ─── shared Prisma client (pointed at test schema by jest.integration.config) ─
const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DATABASE_URL'] } },
  log: [],
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  __resetRedis();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid AssignInput. */
function assignInput(
  shiftId: string,
  employeeId: string,
  overrides: Partial<{
    expectedShiftVersion: number;
    acknowledgeWarnings: boolean;
    actingUserId: string;
  }> = {},
) {
  return {
    shiftId,
    employeeId,
    expectedShiftVersion: overrides.expectedShiftVersion ?? 1,
    action: 'assign' as const,
    acknowledgeWarnings: overrides.acknowledgeWarnings ?? false,
    actingUserId: overrides.actingUserId ?? 'user-test',
  };
}

// ─── 1. Happy path ────────────────────────────────────────────────────────────

describe('1 · happy path — successful assign', () => {
  test('returns outcome:allowed, bumps Shift.version, creates all side-effect rows', async () => {
    const seed = await seedHappyShift(prisma);

    const result = await applyAssignment(assignInput(seed.shiftId, seed.employeeId), prisma);

    // --- service return value ---
    expect(result.status).toBe('ok');
    expect(result.outcome).toBe('allowed');
    expect(result.shift.version).toBe(2);
    expect(result.assignment).not.toBeNull();
    expect(result.assignment!.status).toBe('CONFIRMED');

    // --- Shift.version bumped in DB ---
    const shiftDb = await prisma.shift.findUniqueOrThrow({ where: { id: seed.shiftId } });
    expect(shiftDb.version).toBe(2);

    // --- ShiftAssignment row ---
    const asgn = await prisma.shiftAssignment.findUnique({
      where: { shiftId_employeeId: { shiftId: seed.shiftId, employeeId: seed.employeeId } },
    });
    expect(asgn).not.toBeNull();
    expect(asgn!.assignmentStatus).toBe('CONFIRMED');

    // --- EmployeeScheduleMetrics row ---
    const metrics = await prisma.employeeScheduleMetrics.findUnique({
      where: {
        employeeId_weekStartDate: {
          employeeId: seed.employeeId,
          weekStartDate: seed.weekStartDate,
        },
      },
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.shiftCount).toBe(1);
    expect(metrics!.totalScheduledMinutes).toBe(seed.shiftMinutes); // 480

    // Mon 06:00 UTC → morning classification (hour 6 in UTC)
    expect(metrics!.morningShiftCount).toBe(1);
    expect(metrics!.nightShiftCount).toBe(0);
    expect(metrics!.weekendShiftCount).toBe(0);

    // --- ScheduleAuditLog row ---
    const audit = await prisma.scheduleAuditLog.findFirst({
      where: { organizationId: seed.orgId, entityType: 'ShiftAssignment', actionType: 'ASSIGN' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actionType).toBe('ASSIGN');

    // --- ScheduleEvent row ---
    const event = await prisma.scheduleEvent.findFirst({
      where: { organizationId: seed.orgId, eventType: 'SHIFT_ASSIGNED' },
    });
    expect(event).not.toBeNull();
    expect(event!.aggregateId).toBe(seed.shiftId);
  });
});

// ─── 2. VERSION_MISMATCH ──────────────────────────────────────────────────────

describe('2 · VERSION_MISMATCH — stale expectedShiftVersion', () => {
  test('throws ConflictError with code VERSION_MISMATCH', async () => {
    const seed = await seedHappyShift(prisma);

    // Bump version in DB directly so the real version is now 2.
    await prisma.shift.update({ where: { id: seed.shiftId }, data: { version: 2 } });

    let caught: unknown;
    try {
      await applyAssignment(
        assignInput(seed.shiftId, seed.employeeId, { expectedShiftVersion: 1 }),
        prisma,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictError);
    expect((caught as ConflictError).code).toBe('VERSION_MISMATCH');
  });
});

// ─── 3. SHIFT_LOCKED ─────────────────────────────────────────────────────────

describe('3 · SHIFT_LOCKED — another user holds the lock', () => {
  test('throws ConflictError with code SHIFT_LOCKED', async () => {
    const seed = await seedHappyShift(prisma);

    // Acquire the lock as a different user before our actor tries.
    const acquired = await LocksService.acquire('shift', seed.shiftId, 'other-user-99');
    expect(acquired).toBe(true);

    let caught: unknown;
    try {
      await applyAssignment(
        assignInput(seed.shiftId, seed.employeeId, { actingUserId: 'our-user' }),
        prisma,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictError);
    expect((caught as ConflictError).code).toBe('SHIFT_LOCKED');
  });
});

// ─── 4. CONSTRAINTS_VIOLATED (ROLE_NOT_HELD) ─────────────────────────────────

describe('4 · CONSTRAINTS_VIOLATED — employee lacks required role', () => {
  test('throws ValidationFailedError with CONSTRAINTS_VIOLATED and ROLE_NOT_HELD in violations', async () => {
    // Create a shift bound to role-A but give the employee role-B (or no role).
    const seed = await seedHappyShift(prisma, { grantRoleToEmployee: false });
    // seed.employeeId has NO roles. seed.shiftId requires seed.roleId.

    let caught: unknown;
    try {
      await applyAssignment(assignInput(seed.shiftId, seed.employeeId), prisma);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ValidationFailedError);
    const e = caught as ValidationFailedError;
    expect(e.code).toBe('CONSTRAINTS_VIOLATED');

    // details.violations should contain a ROLE_NOT_HELD entry
    const details = e.details as { violations: Array<{ ruleCode: string }> };
    const codes = details.violations.map((v) => v.ruleCode);
    expect(codes).toContain('ROLE_NOT_HELD');
  });
});

// ─── 5. WARNINGS_REQUIRE_ACK / then ack succeeds ─────────────────────────────

describe('5 · WARNINGS_REQUIRE_ACK — overtime shift triggers warning', () => {
  /**
   * A 10-hour shift (>8h overtimeAfterDailyHours, <=12h maxHoursPerDay) should
   * trigger the OVERTIME_DAILY warning. The org laborRulesJsonb in seedHappyShift
   * has allowOvertimeWithWarning=true and overtimeAfterDailyHours=8.
   */
  const OT_START = new Date('2026-05-25T06:00:00.000Z');
  const OT_END = new Date('2026-05-25T16:00:00.000Z'); // 10 hours

  test('without acknowledgeWarnings → ConflictError WARNINGS_REQUIRE_ACK', async () => {
    const seed = await seedHappyShift(prisma, { shiftStart: OT_START, shiftEnd: OT_END });

    let caught: unknown;
    try {
      await applyAssignment(
        assignInput(seed.shiftId, seed.employeeId, { acknowledgeWarnings: false }),
        prisma,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictError);
    expect((caught as ConflictError).code).toBe('WARNINGS_REQUIRE_ACK');
  });

  test('with acknowledgeWarnings:true → outcome allowed_with_warnings + RuleViolation row', async () => {
    const seed = await seedHappyShift(prisma, { shiftStart: OT_START, shiftEnd: OT_END });

    const result = await applyAssignment(
      assignInput(seed.shiftId, seed.employeeId, { acknowledgeWarnings: true }),
      prisma,
    );

    expect(result.status).toBe('ok');
    expect(result.outcome).toBe('allowed_with_warnings');

    // A RuleViolation row should exist for the overtime warning.
    const violation = await prisma.ruleViolation.findFirst({
      where: { organizationId: seed.orgId, shiftId: seed.shiftId },
    });
    expect(violation).not.toBeNull();
    expect(violation!.severity).toBe('WARNING');
    expect(violation!.ruleCode).toBe('OVERTIME_DAILY');
  });
});

// ─── 6. Concurrent double-PATCH (optimistic lock race) ───────────────────────

describe('6 · concurrent double-PATCH — exactly one wins', () => {
  test(
    'two callers with expectedShiftVersion:1 → one succeeds, one gets VERSION_MISMATCH',
    async () => {
      // Two separate employees, both trying to assign themselves to the SAME shift
      // with the same stale version.
      const seed = await seedHappyShift(prisma);

      // Create a second employee who also has the required role and availability.
      const employee2 = await prisma.employee.create({
        data: {
          organizationId: seed.orgId,
          fullName: 'Employee Two',
          email: `emp2-${Date.now()}@test.com`,
          isActive: true,
          defaultTimezone: 'UTC',
        },
      });
      await prisma.employeeRole.create({
        data: { employeeId: employee2.id, roleId: seed.roleId, skillLevel: 1, isPrimary: false },
      });
      await prisma.employeeAvailabilityRule.create({
        data: {
          employeeId: employee2.id,
          dayOfWeek: 1,
          startLocalTime: '00:00:00',
          endLocalTime: '23:59:00',
          availabilityType: 'AVAILABLE',
          timezone: 'UTC',
        },
      });

      // Fire both simultaneously — each uses expectedShiftVersion: 1
      const results = await Promise.allSettled([
        applyAssignment(
          { ...assignInput(seed.shiftId, seed.employeeId), actingUserId: 'actor-1' },
          prisma,
        ),
        applyAssignment(
          { ...assignInput(seed.shiftId, employee2.id), actingUserId: 'actor-2' },
          prisma,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(ConflictError);
      expect((rejectedReason as ConflictError).code).toBe('VERSION_MISMATCH');
    },
    30_000,
  );
});

// ─── 7. Metrics delta — two shifts, cumulative totals ────────────────────────

describe('7 · metrics delta — two shifts in the same week', () => {
  test(
    'shiftCount=2, correct totalScheduledMinutes, night/morning counters classified',
    async () => {
      // Shift A: Mon 06:00–14:00 UTC → 480 min, morning
      const seedA = await seedHappyShift(prisma, {
        shiftStart: new Date('2026-05-25T06:00:00.000Z'),
        shiftEnd: new Date('2026-05-25T14:00:00.000Z'),
      });

      // Shift B: same employee, same org – Tue 22:00–06:00 UTC spans midnight.
      // We make it a single-day night shift Tue 22:00–Tue 23:59 (117 min) to stay
      // within one calendar day and avoid triggering maxHoursPerDay violations.
      // Tue = 2026-05-26, dayOfWeek 2 in 0=Sun scheme.
      const shiftBStart = new Date('2026-05-26T22:00:00.000Z');
      const shiftBEnd = new Date('2026-05-26T23:59:00.000Z');
      const shiftBMinutes = Math.round((shiftBEnd.getTime() - shiftBStart.getTime()) / 60000); // 119

      const shiftB = await createShift(prisma, seedA.orgId, {
        locationId: seedA.locationId,
        roleId: seedA.roleId,
        startAtUtc: shiftBStart,
        endAtUtc: shiftBEnd,
        timezone: 'UTC',
      });

      // Give employee availability for Tuesday night
      await prisma.employeeAvailabilityRule.create({
        data: {
          employeeId: seedA.employeeId,
          dayOfWeek: 2, // Tuesday
          startLocalTime: '22:00:00',
          endLocalTime: '23:59:00',
          availabilityType: 'AVAILABLE',
          timezone: 'UTC',
        },
      });

      // Assign shift A
      await applyAssignment(
        assignInput(seedA.shiftId, seedA.employeeId),
        prisma,
      );

      // Assign shift B (version is 1, brand-new shift)
      await applyAssignment(
        assignInput(shiftB.id, seedA.employeeId),
        prisma,
      );

      // Verify cumulative metrics for the week starting 2026-05-25
      const metrics = await prisma.employeeScheduleMetrics.findUnique({
        where: {
          employeeId_weekStartDate: {
            employeeId: seedA.employeeId,
            weekStartDate: seedA.weekStartDate,
          },
        },
      });
      expect(metrics).not.toBeNull();
      expect(metrics!.shiftCount).toBe(2);
      expect(metrics!.totalScheduledMinutes).toBe(seedA.shiftMinutes + shiftBMinutes);

      // Shift A starts at 06:00 → morning; Shift B starts at 22:00 → night
      expect(metrics!.morningShiftCount).toBe(1);
      expect(metrics!.nightShiftCount).toBe(1);

      // Monday and Tuesday are both weekdays in UTC; neither is Fri/Sat/Sun
      expect(metrics!.weekendShiftCount).toBe(0);
    },
    30_000,
  );
});

// ─── validateOnly smoke ───────────────────────────────────────────────────────

describe('validateOnly — dry-run does not write rows', () => {
  test('returns outcome:allowed without creating any side-effect rows', async () => {
    const seed = await seedHappyShift(prisma);

    const result = await validateOnly(
      {
        shiftId: seed.shiftId,
        employeeId: seed.employeeId,
        expectedShiftVersion: 1,
        action: 'assign',
        actingUserId: 'dry-run-user',
      },
      prisma,
    );

    expect(result.outcome).toBe('allowed');

    // Shift version should NOT have changed
    const shiftDb = await prisma.shift.findUniqueOrThrow({ where: { id: seed.shiftId } });
    expect(shiftDb.version).toBe(1);

    // No assignment row
    const asgn = await prisma.shiftAssignment.findUnique({
      where: { shiftId_employeeId: { shiftId: seed.shiftId, employeeId: seed.employeeId } },
    });
    expect(asgn).toBeNull();
  });
});
