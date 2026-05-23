import type { PrismaClient, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma as defaultPrisma, ensureTx } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { LocksService } from '../locks/locks.service';
import { writeAudit } from '../audit/audit.service';
import { writeEvent, publishEvent } from '../events/events.service';
import {
  mergeRulesSnapshot,
  parseLaborRulesJson,
} from '../rules/snapshot.service';
import {
  validateAssignment,
  FAST_RULES,
} from '../rules/validator.service';
import type {
  ValidationContext,
  ValidationResult,
  RulesSnapshot,
} from '../rules/types';
import { ConflictError, NotFoundError, ValidationFailedError } from '../../shared/errors';

export type AssignAction = 'assign' | 'unassign' | 'replace';

export interface AssignInput {
  shiftId: string;
  employeeId: string;
  expectedShiftVersion: number;
  expectedAssignmentVersion?: number;
  action: AssignAction;
  acknowledgeWarnings: boolean;
  actingUserId: string;
  /** Cross-tenant guard — must match the shift's org. Set from req.user.orgId. */
  organizationId?: string;
}

export interface AssignResult {
  status: 'ok';
  outcome: ValidationResult['outcome'];
  shift: { id: string; version: number };
  assignment: { id: string; version: number; status: string } | null;
  results: ValidationResult['results'];
}

async function loadContext(
  tx: Prisma.TransactionClient,
  shiftId: string,
  employeeId: string,
  actingUserId: string,
  organizationId?: string,
): Promise<ValidationContext> {
  const shift = await tx.shift.findUnique({
    where: { id: shiftId },
    include: { location: true, organization: true },
  });
  if (!shift) throw new NotFoundError('Shift not found');
  // Cross-tenant guard — when org id provided, enforce match.
  if (organizationId && shift.organizationId !== organizationId) {
    throw new NotFoundError('Shift not found');
  }

  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    include: { roles: true },
  });
  if (!employee) throw new NotFoundError('Employee not found');
  if (organizationId && employee.organizationId !== organizationId) {
    throw new NotFoundError('Employee not found');
  }

  const availabilityRules = await tx.employeeAvailabilityRule.findMany({
    where: { employeeId },
  });

  // window: ± 8 days for min-rest + overlap
  const lookbackStart = new Date(shift.startAtUtc);
  lookbackStart.setDate(lookbackStart.getDate() - 8);
  const lookbackEnd = new Date(shift.endAtUtc);
  lookbackEnd.setDate(lookbackEnd.getDate() + 8);

  const existingAssignments = await tx.shiftAssignment.findMany({
    where: {
      employeeId,
      shift: {
        startAtUtc: { lt: lookbackEnd },
        endAtUtc: { gt: lookbackStart },
      },
    },
    include: { shift: true },
  });

  const weekStartDate = DateTime.fromJSDate(shift.startAtUtc)
    .setZone(shift.timezone)
    .startOf('week')
    .toJSDate();

  const metrics = await tx.employeeScheduleMetrics.findUnique({
    where: {
      employeeId_weekStartDate: { employeeId, weekStartDate },
    },
  });

  const snapshot: RulesSnapshot = mergeRulesSnapshot(
    parseLaborRulesJson(shift.organization.laborRulesJsonb),
    parseLaborRulesJson(shift.location?.laborRulesJsonb),
  );

  const activeLockUserId = await LocksService.peek('shift', shiftId);

  return {
    shift,
    employee,
    availabilityRules,
    existingAssignments,
    rulesSnapshot: snapshot,
    metrics,
    activeLockUserId,
    actingUserId,
  };
}

function shiftMinutes(startAtUtc: Date, endAtUtc: Date): number {
  return Math.round((endAtUtc.getTime() - startAtUtc.getTime()) / 60000);
}

function classifyShiftStartLocal(startAtUtc: Date, timezone: string) {
  const local = DateTime.fromJSDate(startAtUtc).setZone(timezone);
  const hour = local.hour;
  const dayOfWeek = local.weekday === 7 ? 0 : local.weekday; // 0=Sun..6=Sat
  return {
    isNight: hour >= 22 || hour < 6,
    isMorning: hour >= 6 && hour < 12,
    isEvening: hour >= 12 && hour < 22,
    isWeekend: dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0, // Fri/Sat/Sun (Israeli weekend Fri-Sat; tolerate Sun)
  };
}

async function applyMetricsDelta(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    employeeId: string;
    scheduleId: string | null;
    weekStartDate: Date;
    deltaMinutes: number;
    deltaShiftCount: number;
    classification: ReturnType<typeof classifyShiftStartLocal>;
  },
) {
  const delta = args.deltaShiftCount;
  await tx.employeeScheduleMetrics.upsert({
    where: {
      employeeId_weekStartDate: {
        employeeId: args.employeeId,
        weekStartDate: args.weekStartDate,
      },
    },
    create: {
      organizationId: args.organizationId,
      scheduleId: args.scheduleId,
      employeeId: args.employeeId,
      weekStartDate: args.weekStartDate,
      totalScheduledMinutes: Math.max(0, args.deltaMinutes),
      totalPaidMinutes: Math.max(0, args.deltaMinutes),
      shiftCount: Math.max(0, delta),
      weekendShiftCount: args.classification.isWeekend ? Math.max(0, delta) : 0,
      nightShiftCount: args.classification.isNight ? Math.max(0, delta) : 0,
      morningShiftCount: args.classification.isMorning ? Math.max(0, delta) : 0,
      eveningShiftCount: args.classification.isEvening ? Math.max(0, delta) : 0,
    },
    update: {
      totalScheduledMinutes: { increment: args.deltaMinutes },
      totalPaidMinutes: { increment: args.deltaMinutes },
      shiftCount: { increment: delta },
      weekendShiftCount: args.classification.isWeekend ? { increment: delta } : undefined,
      nightShiftCount: args.classification.isNight ? { increment: delta } : undefined,
      morningShiftCount: args.classification.isMorning ? { increment: delta } : undefined,
      eveningShiftCount: args.classification.isEvening ? { increment: delta } : undefined,
    },
  });
}

export async function validateOnly(
  input: Omit<AssignInput, 'acknowledgeWarnings'> & { acknowledgeWarnings?: boolean },
  prisma: Db = defaultPrisma,
): Promise<ValidationResult> {
  return ensureTx(prisma, async (tx) => {
    const ctx = await loadContext(tx, input.shiftId, input.employeeId, input.actingUserId, input.organizationId);
    return validateAssignment(ctx);
  });
}

export async function applyAssignment(
  input: AssignInput,
  prisma: Db = defaultPrisma,
): Promise<AssignResult> {
  const eventToPublish = await ensureTx(prisma, async (tx) => {
    const ctx = await loadContext(tx, input.shiftId, input.employeeId, input.actingUserId, input.organizationId);

    if (ctx.shift.version !== input.expectedShiftVersion) {
      throw new ConflictError(
        'VERSION_MISMATCH',
        'Shift was modified by someone else. Reload and retry.',
        { current: ctx.shift.version, expected: input.expectedShiftVersion },
      );
    }

    if (ctx.activeLockUserId && ctx.activeLockUserId !== input.actingUserId) {
      throw new ConflictError(
        'SHIFT_LOCKED',
        'This shift is being edited by another user.',
        { lockedBy: ctx.activeLockUserId },
      );
    }

    const validation = await validateAssignment(ctx);

    if (validation.outcome === 'blocked') {
      throw new ValidationFailedError(
        'CONSTRAINTS_VIOLATED',
        'Assignment violates one or more blocking rules.',
        { violations: validation.blocking },
      );
    }
    if (
      validation.outcome === 'allowed_with_warnings' &&
      !input.acknowledgeWarnings
    ) {
      throw new ConflictError(
        'WARNINGS_REQUIRE_ACK',
        'Acknowledge warnings to proceed.',
        { warnings: validation.warnings },
      );
    }

    const minutes = shiftMinutes(ctx.shift.startAtUtc, ctx.shift.endAtUtc);
    const classification = classifyShiftStartLocal(
      ctx.shift.startAtUtc,
      ctx.shift.timezone,
    );
    const weekStartDate = DateTime.fromJSDate(ctx.shift.startAtUtc)
      .setZone(ctx.shift.timezone)
      .startOf('week')
      .toJSDate();

    let assignmentRow: { id: string; version: number; assignmentStatus: string } | null = null;

    if (input.action === 'unassign') {
      const existing = await tx.shiftAssignment.findUnique({
        where: { shiftId_employeeId: { shiftId: input.shiftId, employeeId: input.employeeId } },
      });
      if (!existing) {
        throw new NotFoundError('No active assignment to remove');
      }
      await tx.shiftAssignment.update({
        where: { id: existing.id },
        data: { assignmentStatus: 'CANCELLED', version: { increment: 1 } },
      });
      await applyMetricsDelta(tx, {
        organizationId: ctx.shift.organizationId,
        employeeId: input.employeeId,
        scheduleId: ctx.shift.scheduleId,
        weekStartDate,
        deltaMinutes: -minutes,
        deltaShiftCount: -1,
        classification,
      });
      await writeAudit(tx, {
        organizationId: ctx.shift.organizationId,
        scheduleId: ctx.shift.scheduleId,
        userId: input.actingUserId,
        actionType: 'UNASSIGN',
        entityType: 'ShiftAssignment',
        entityId: existing.id,
        before: existing,
        after: null,
      });
      const ev = await writeEvent(tx, {
        organizationId: ctx.shift.organizationId,
        eventType: 'SHIFT_UNASSIGNED',
        aggregateType: 'Shift',
        aggregateId: input.shiftId,
        payload: { employeeId: input.employeeId, assignmentId: existing.id },
        userId: input.actingUserId,
      });
      const updatedShift = await tx.shift.update({
        where: { id: input.shiftId },
        data: { version: { increment: 1 } },
      });
      return {
        publishPayload: {
          id: ev.id,
          organizationId: ctx.shift.organizationId,
          eventType: 'SHIFT_UNASSIGNED' as const,
          aggregateType: 'Shift',
          aggregateId: input.shiftId,
          payload: { employeeId: input.employeeId },
          userId: input.actingUserId,
        },
        result: {
          status: 'ok' as const,
          outcome: validation.outcome,
          shift: { id: updatedShift.id, version: updatedShift.version },
          assignment: null,
          results: validation.results,
        },
      };
    }

    // assign or replace
    const upserted = await tx.shiftAssignment.upsert({
      where: {
        shiftId_employeeId: { shiftId: input.shiftId, employeeId: input.employeeId },
      },
      create: {
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        assignmentStatus: 'CONFIRMED',
        source: 'MANUAL',
        assignedByUserId: input.actingUserId,
      },
      update: {
        assignmentStatus: 'CONFIRMED',
        assignedByUserId: input.actingUserId,
        version: { increment: 1 },
      },
    });

    // metrics delta only when assignment newly counts as active
    await applyMetricsDelta(tx, {
      organizationId: ctx.shift.organizationId,
      employeeId: input.employeeId,
      scheduleId: ctx.shift.scheduleId,
      weekStartDate,
      deltaMinutes: minutes,
      deltaShiftCount: 1,
      classification,
    });

    // persist warning-level violations (informational)
    for (const w of validation.warnings) {
      await tx.ruleViolation.create({
        data: {
          organizationId: ctx.shift.organizationId,
          scheduleId: ctx.shift.scheduleId,
          shiftId: input.shiftId,
          employeeId: input.employeeId,
          ruleCode: w.ruleCode,
          severity: 'WARNING',
          message: w.message ?? '',
          metadataJsonb: (w.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    }

    await writeAudit(tx, {
      organizationId: ctx.shift.organizationId,
      scheduleId: ctx.shift.scheduleId,
      userId: input.actingUserId,
      actionType: 'ASSIGN',
      entityType: 'ShiftAssignment',
      entityId: upserted.id,
      before: null,
      after: upserted,
    });

    const ev = await writeEvent(tx, {
      organizationId: ctx.shift.organizationId,
      eventType: 'SHIFT_ASSIGNED',
      aggregateType: 'Shift',
      aggregateId: input.shiftId,
      payload: { employeeId: input.employeeId, assignmentId: upserted.id },
      userId: input.actingUserId,
    });

    const updatedShift = await tx.shift.update({
      where: { id: input.shiftId },
      data: { version: { increment: 1 } },
    });

    assignmentRow = upserted;

    return {
      publishPayload: {
        id: ev.id,
        organizationId: ctx.shift.organizationId,
        eventType: 'SHIFT_ASSIGNED' as const,
        aggregateType: 'Shift',
        aggregateId: input.shiftId,
        payload: { employeeId: input.employeeId, assignmentId: assignmentRow.id },
        userId: input.actingUserId,
      },
      result: {
        status: 'ok' as const,
        outcome: validation.outcome,
        shift: { id: updatedShift.id, version: updatedShift.version },
        assignment: {
          id: assignmentRow.id,
          version: assignmentRow.version,
          status: assignmentRow.assignmentStatus,
        },
        results: validation.results,
      },
    };
  });

  // post-commit publish
  void publishEvent(eventToPublish.publishPayload);
  return eventToPublish.result;
}

export const __test = { FAST_RULES };
