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
import { validateAssignment } from '../rules/validator.service';
import type {
  ValidationContext,
  ValidationResult,
  RulesSnapshot,
} from '../rules/types';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../shared/errors';
import {
  classifyShiftStartLocal,
  shiftMinutes,
  weekStartFor,
} from '../../shared/shift-classification';

export interface ClaimInput {
  shiftId: string;
  employeeId: string;
  acknowledgeWarnings: boolean;
  actingUserId: string;
}

export interface ClaimResult {
  status: 'ok';
  claim: {
    id: string;
    shiftId: string;
    employeeId: string;
    status: string;
    warningsCount: number;
  };
  outcome: ValidationResult['outcome'];
  results: ValidationResult['results'];
}

export interface ApproveClaimInput {
  claimId: string;
  actingUserId: string;
  expectedShiftVersion?: number;
}

export interface ApproveClaimResult {
  status: 'ok';
  claim: { id: string; status: string };
  assignment: { id: string; version: number; status: string };
  shift: { id: string; version: number };
}

export interface RejectClaimInput {
  claimId: string;
  actingUserId: string;
  reason?: string;
}

async function loadValidationContext(
  tx: Prisma.TransactionClient,
  shiftId: string,
  employeeId: string,
  actingUserId: string,
): Promise<ValidationContext> {
  const shift = await tx.shift.findUnique({
    where: { id: shiftId },
    include: { location: true, organization: true },
  });
  if (!shift) throw new NotFoundError('Shift not found');

  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    include: { roles: true },
  });
  if (!employee) throw new NotFoundError('Employee not found');

  const availabilityRules = await tx.employeeAvailabilityRule.findMany({
    where: { employeeId },
  });

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
    where: { employeeId_weekStartDate: { employeeId, weekStartDate } },
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

export async function claimOpenShift(
  input: ClaimInput,
  prisma: Db = defaultPrisma,
): Promise<ClaimResult> {
  const committed = await ensureTx(prisma, async (tx) => {
    const shift = await tx.shift.findUnique({
      where: { id: input.shiftId },
      include: { location: true, organization: true },
    });
    if (!shift) throw new NotFoundError('Shift not found');
    if (!shift.isOpenShift) {
      throw new ConflictError(
        'SHIFT_NOT_OPEN',
        'This shift is not an open shift.',
      );
    }

    const existing = await tx.openShiftClaim.findFirst({
      where: {
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new ConflictError(
        'CLAIM_ALREADY_PENDING',
        'You already have a pending claim for this shift.',
        { claimId: existing.id },
      );
    }

    // pre-flight validation against this employee
    const ctx = await loadValidationContext(
      tx,
      input.shiftId,
      input.employeeId,
      input.actingUserId,
    );
    const validation = await validateAssignment(ctx);

    if (validation.outcome === 'blocked') {
      throw new ValidationFailedError(
        'CONSTRAINTS_VIOLATED',
        'Claim violates one or more blocking rules.',
        { violations: validation.blocking },
      );
    }

    const warningsCount = validation.warnings.length;

    const claim = await tx.openShiftClaim.create({
      data: {
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        status: 'PENDING',
      },
    });

    await writeAudit(tx, {
      organizationId: shift.organizationId,
      scheduleId: shift.scheduleId,
      userId: input.actingUserId,
      actionType: 'CREATE',
      entityType: 'OpenShiftClaim',
      entityId: claim.id,
      before: null,
      after: { ...claim, warningsCount },
    });

    const ev = await writeEvent(tx, {
      organizationId: shift.organizationId,
      eventType: 'OPEN_SHIFT_CLAIMED',
      aggregateType: 'OpenShiftClaim',
      aggregateId: claim.id,
      payload: {
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        warningsCount,
      },
      userId: input.actingUserId,
    });

    return {
      publishPayload: {
        id: ev.id,
        organizationId: shift.organizationId,
        eventType: 'OPEN_SHIFT_CLAIMED' as const,
        aggregateType: 'OpenShiftClaim',
        aggregateId: claim.id,
        payload: {
          shiftId: input.shiftId,
          employeeId: input.employeeId,
          warningsCount,
        },
        userId: input.actingUserId,
      },
      result: {
        status: 'ok' as const,
        claim: {
          id: claim.id,
          shiftId: claim.shiftId,
          employeeId: claim.employeeId,
          status: claim.status,
          warningsCount,
        },
        outcome: validation.outcome,
        results: validation.results,
      },
    };
  });

  void publishEvent(committed.publishPayload);
  return committed.result;
}

export async function approveClaim(
  input: ApproveClaimInput,
  prisma: Db = defaultPrisma,
): Promise<ApproveClaimResult> {
  const committed = await ensureTx(prisma, async (tx) => {
    const claim = await tx.openShiftClaim.findUnique({
      where: { id: input.claimId },
    });
    if (!claim) throw new NotFoundError('Claim not found');
    if (claim.status !== 'PENDING') {
      throw new ConflictError(
        'CLAIM_WRONG_STATE',
        `Claim is in state ${claim.status} and cannot be approved.`,
        { currentStatus: claim.status },
      );
    }

    const shift = await tx.shift.findUnique({
      where: { id: claim.shiftId },
      include: { organization: true },
    });
    if (!shift) throw new NotFoundError('Shift not found');

    if (
      typeof input.expectedShiftVersion === 'number' &&
      shift.version !== input.expectedShiftVersion
    ) {
      throw new ConflictError(
        'VERSION_MISMATCH',
        'Shift was modified by someone else. Reload and retry.',
        { current: shift.version, expected: input.expectedShiftVersion },
      );
    }

    const minutes = shiftMinutes(shift.startAtUtc, shift.endAtUtc);
    const classification = classifyShiftStartLocal(
      shift.startAtUtc,
      shift.timezone,
    );
    const weekStartDate = weekStartFor(shift.startAtUtc, shift.timezone);

    const assignment = await tx.shiftAssignment.upsert({
      where: {
        shiftId_employeeId: {
          shiftId: claim.shiftId,
          employeeId: claim.employeeId,
        },
      },
      create: {
        shiftId: claim.shiftId,
        employeeId: claim.employeeId,
        assignmentStatus: 'CONFIRMED',
        source: 'OPEN_SHIFT_CLAIM',
        assignedByUserId: input.actingUserId,
      },
      update: {
        assignmentStatus: 'CONFIRMED',
        source: 'OPEN_SHIFT_CLAIM',
        assignedByUserId: input.actingUserId,
        version: { increment: 1 },
      },
    });

    await applyMetricsDelta(tx, {
      organizationId: shift.organizationId,
      employeeId: claim.employeeId,
      scheduleId: shift.scheduleId,
      weekStartDate,
      deltaMinutes: minutes,
      deltaShiftCount: 1,
      classification,
    });

    const updatedClaim = await tx.openShiftClaim.update({
      where: { id: claim.id },
      data: {
        status: 'APPROVED',
        approvedByUserId: input.actingUserId,
      },
    });

    const updatedShift = await tx.shift.update({
      where: { id: shift.id },
      data: { version: { increment: 1 } },
    });

    await writeAudit(tx, {
      organizationId: shift.organizationId,
      scheduleId: shift.scheduleId,
      userId: input.actingUserId,
      actionType: 'ASSIGN',
      entityType: 'OpenShiftClaim',
      entityId: claim.id,
      before: claim,
      after: updatedClaim,
    });

    const ev = await writeEvent(tx, {
      organizationId: shift.organizationId,
      eventType: 'OPEN_SHIFT_APPROVED',
      aggregateType: 'OpenShiftClaim',
      aggregateId: claim.id,
      payload: {
        shiftId: claim.shiftId,
        employeeId: claim.employeeId,
        assignmentId: assignment.id,
      },
      userId: input.actingUserId,
    });

    return {
      publishPayload: {
        id: ev.id,
        organizationId: shift.organizationId,
        eventType: 'OPEN_SHIFT_APPROVED' as const,
        aggregateType: 'OpenShiftClaim',
        aggregateId: claim.id,
        payload: {
          shiftId: claim.shiftId,
          employeeId: claim.employeeId,
          assignmentId: assignment.id,
        },
        userId: input.actingUserId,
      },
      result: {
        status: 'ok' as const,
        claim: { id: updatedClaim.id, status: updatedClaim.status },
        assignment: {
          id: assignment.id,
          version: assignment.version,
          status: assignment.assignmentStatus,
        },
        shift: { id: updatedShift.id, version: updatedShift.version },
      },
    };
  });

  void publishEvent(committed.publishPayload);
  return committed.result;
}

export async function rejectClaim(
  input: RejectClaimInput,
  prisma: Db = defaultPrisma,
): Promise<{ status: 'ok'; claim: { id: string; status: string } }> {
  return ensureTx(prisma, async (tx) => {
    const claim = await tx.openShiftClaim.findUnique({
      where: { id: input.claimId },
      include: { shift: true },
    });
    if (!claim) throw new NotFoundError('Claim not found');
    if (claim.status !== 'PENDING') {
      throw new ConflictError(
        'CLAIM_WRONG_STATE',
        `Claim is in state ${claim.status} and cannot be rejected.`,
        { currentStatus: claim.status },
      );
    }

    const updated = await tx.openShiftClaim.update({
      where: { id: claim.id },
      data: {
        status: 'REJECTED',
        approvedByUserId: input.actingUserId,
      },
    });

    await writeAudit(tx, {
      organizationId: claim.shift.organizationId,
      scheduleId: claim.shift.scheduleId,
      userId: input.actingUserId,
      actionType: 'UPDATE',
      entityType: 'OpenShiftClaim',
      entityId: claim.id,
      before: claim,
      after: { ...updated, reason: input.reason ?? null } as unknown as Prisma.InputJsonValue,
    });

    return {
      status: 'ok' as const,
      claim: { id: updated.id, status: updated.status },
    };
  });
}
