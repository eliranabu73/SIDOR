import type { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/prisma';
import { writeAudit } from '../audit/audit.service';
import { writeEvent, publishEvent } from '../events/events.service';
import {
  ConflictError,
  HttpError,
  NotFoundError,
} from '../../shared/errors';
import {
  classifyShiftStartLocal,
  shiftMinutes,
  weekStartFor,
} from '../../shared/shift-classification';

// Local typed not-authorized error so route layer can serialize uniformly.
class SwapNotAuthorizedError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(403, 'SWAP_NOT_AUTHORIZED', message, details);
  }
}

export interface CreateSwapInput {
  sourceAssignmentId: string;
  requestingEmployeeId: string;
  targetEmployeeId?: string | null;
  actingUserId: string;
}

export interface CreateSwapResult {
  status: 'ok';
  swap: {
    id: string;
    status: string;
    sourceAssignmentId: string;
    requestingEmployeeId: string;
    targetEmployeeId: string | null;
  };
}

export interface ApproveSwapInput {
  swapId: string;
  actingUserId: string;
  approvingEmployeeId?: string;
  asManager: boolean;
}

export interface ApproveSwapResult {
  status: 'ok';
  swap: { id: string; status: string };
  assignment?: { id: string; version: number; status: string };
  shift?: { id: string; version: number };
}

export interface RejectSwapInput {
  swapId: string;
  actingUserId: string;
  reason?: string;
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

export async function createSwap(
  input: CreateSwapInput,
  prisma: PrismaClient = defaultPrisma,
): Promise<CreateSwapResult> {
  const committed = await prisma.$transaction(async (tx) => {
    const assignment = await tx.shiftAssignment.findUnique({
      where: { id: input.sourceAssignmentId },
      include: { shift: true },
    });
    if (!assignment) {
      throw new NotFoundError('Source assignment not found');
    }
    if (assignment.employeeId !== input.requestingEmployeeId) {
      throw new SwapNotAuthorizedError(
        'Requesting employee does not own the source assignment.',
      );
    }
    if (assignment.assignmentStatus !== 'CONFIRMED') {
      throw new ConflictError(
        'SWAP_INVALID_SOURCE',
        `Source assignment is in state ${assignment.assignmentStatus}.`,
        { currentStatus: assignment.assignmentStatus },
      );
    }
    if (
      input.targetEmployeeId &&
      input.targetEmployeeId === input.requestingEmployeeId
    ) {
      throw new ConflictError(
        'SWAP_INVALID_TARGET',
        'Target employee must differ from requesting employee.',
      );
    }

    const organizationId = assignment.shift.organizationId;
    const scheduleId = assignment.shift.scheduleId;

    const swap = await tx.shiftSwapRequest.create({
      data: {
        organizationId,
        sourceAssignmentId: input.sourceAssignmentId,
        requestingEmployeeId: input.requestingEmployeeId,
        targetEmployeeId: input.targetEmployeeId ?? null,
        status: 'PENDING',
      },
    });

    await writeAudit(tx, {
      organizationId,
      scheduleId,
      userId: input.actingUserId,
      actionType: 'CREATE',
      entityType: 'ShiftSwapRequest',
      entityId: swap.id,
      before: null,
      after: swap,
    });

    const ev = await writeEvent(tx, {
      organizationId,
      eventType: 'SWAP_REQUESTED',
      aggregateType: 'ShiftSwapRequest',
      aggregateId: swap.id,
      payload: {
        sourceAssignmentId: input.sourceAssignmentId,
        shiftId: assignment.shiftId,
        requestingEmployeeId: input.requestingEmployeeId,
        targetEmployeeId: input.targetEmployeeId ?? null,
      },
      userId: input.actingUserId,
    });

    return {
      publishPayload: {
        id: ev.id,
        organizationId,
        eventType: 'SWAP_REQUESTED' as const,
        aggregateType: 'ShiftSwapRequest',
        aggregateId: swap.id,
        payload: {
          sourceAssignmentId: input.sourceAssignmentId,
          shiftId: assignment.shiftId,
          requestingEmployeeId: input.requestingEmployeeId,
          targetEmployeeId: input.targetEmployeeId ?? null,
        },
        userId: input.actingUserId,
      },
      result: {
        status: 'ok' as const,
        swap: {
          id: swap.id,
          status: swap.status,
          sourceAssignmentId: swap.sourceAssignmentId,
          requestingEmployeeId: swap.requestingEmployeeId,
          targetEmployeeId: swap.targetEmployeeId,
        },
      },
    };
  });

  void publishEvent(committed.publishPayload);
  return committed.result;
}

export async function approveSwap(
  input: ApproveSwapInput,
  prisma: PrismaClient = defaultPrisma,
): Promise<ApproveSwapResult> {
  const committed = await prisma.$transaction(async (tx) => {
    const swap = await tx.shiftSwapRequest.findUnique({
      where: { id: input.swapId },
    });
    if (!swap) {
      throw new HttpError(404, 'SWAP_NOT_FOUND', 'Swap not found');
    }

    // Manager finalization
    if (input.asManager) {
      if (swap.status !== 'APPROVED_BY_TARGET') {
        throw new ConflictError(
          'SWAP_WRONG_STATE',
          `Swap is in state ${swap.status}; manager approval requires APPROVED_BY_TARGET.`,
          { currentStatus: swap.status },
        );
      }
      if (!swap.targetEmployeeId) {
        throw new ConflictError(
          'SWAP_WRONG_STATE',
          'Swap has no target employee to assign.',
        );
      }

      const sourceAssignment = await tx.shiftAssignment.findUnique({
        where: { id: swap.sourceAssignmentId },
        include: { shift: true },
      });
      if (!sourceAssignment) {
        throw new NotFoundError('Source assignment not found');
      }
      const shift = sourceAssignment.shift;
      const minutes = shiftMinutes(shift.startAtUtc, shift.endAtUtc);
      const classification = classifyShiftStartLocal(
        shift.startAtUtc,
        shift.timezone,
      );
      const weekStartDate = weekStartFor(shift.startAtUtc, shift.timezone);

      // Cancel source assignment
      const cancelledSource = await tx.shiftAssignment.update({
        where: { id: sourceAssignment.id },
        data: {
          assignmentStatus: 'CANCELLED',
          version: { increment: 1 },
        },
      });

      await applyMetricsDelta(tx, {
        organizationId: shift.organizationId,
        employeeId: sourceAssignment.employeeId,
        scheduleId: shift.scheduleId,
        weekStartDate,
        deltaMinutes: -minutes,
        deltaShiftCount: -1,
        classification,
      });

      // Create new assignment for target employee
      const newAssignment = await tx.shiftAssignment.upsert({
        where: {
          shiftId_employeeId: {
            shiftId: shift.id,
            employeeId: swap.targetEmployeeId,
          },
        },
        create: {
          shiftId: shift.id,
          employeeId: swap.targetEmployeeId,
          assignmentStatus: 'CONFIRMED',
          source: 'SHIFT_SWAP',
          assignedByUserId: input.actingUserId,
        },
        update: {
          assignmentStatus: 'CONFIRMED',
          source: 'SHIFT_SWAP',
          assignedByUserId: input.actingUserId,
          version: { increment: 1 },
        },
      });

      await applyMetricsDelta(tx, {
        organizationId: shift.organizationId,
        employeeId: swap.targetEmployeeId,
        scheduleId: shift.scheduleId,
        weekStartDate,
        deltaMinutes: minutes,
        deltaShiftCount: 1,
        classification,
      });

      const updatedShift = await tx.shift.update({
        where: { id: shift.id },
        data: { version: { increment: 1 } },
      });

      const updatedSwap = await tx.shiftSwapRequest.update({
        where: { id: swap.id },
        data: {
          status: 'APPROVED_BY_MANAGER',
          approvedByManagerId: input.actingUserId,
        },
      });

      await writeAudit(tx, {
        organizationId: shift.organizationId,
        scheduleId: shift.scheduleId,
        userId: input.actingUserId,
        actionType: 'ASSIGN',
        entityType: 'ShiftSwapRequest',
        entityId: swap.id,
        before: swap,
        after: {
          swap: updatedSwap,
          cancelledSourceAssignmentId: cancelledSource.id,
          newAssignmentId: newAssignment.id,
        } as unknown as Prisma.InputJsonValue,
      });

      const ev = await writeEvent(tx, {
        organizationId: shift.organizationId,
        eventType: 'SWAP_APPROVED',
        aggregateType: 'ShiftSwapRequest',
        aggregateId: swap.id,
        payload: {
          shiftId: shift.id,
          fromEmployeeId: sourceAssignment.employeeId,
          toEmployeeId: swap.targetEmployeeId,
          newAssignmentId: newAssignment.id,
        },
        userId: input.actingUserId,
      });

      return {
        publishPayload: {
          id: ev.id,
          organizationId: shift.organizationId,
          eventType: 'SWAP_APPROVED' as const,
          aggregateType: 'ShiftSwapRequest',
          aggregateId: swap.id,
          payload: {
            shiftId: shift.id,
            fromEmployeeId: sourceAssignment.employeeId,
            toEmployeeId: swap.targetEmployeeId,
            newAssignmentId: newAssignment.id,
          },
          userId: input.actingUserId,
        },
        result: {
          status: 'ok' as const,
          swap: { id: updatedSwap.id, status: updatedSwap.status },
          assignment: {
            id: newAssignment.id,
            version: newAssignment.version,
            status: newAssignment.assignmentStatus,
          },
          shift: { id: updatedShift.id, version: updatedShift.version },
        },
      };
    }

    // Target-employee approval branch
    if (swap.status !== 'PENDING') {
      throw new ConflictError(
        'SWAP_WRONG_STATE',
        `Swap is in state ${swap.status}; cannot accept target approval.`,
        { currentStatus: swap.status },
      );
    }

    const approvingEmployeeId = input.approvingEmployeeId;
    if (!approvingEmployeeId) {
      throw new SwapNotAuthorizedError(
        'approvingEmployeeId is required when approving as a target employee.',
      );
    }
    if (approvingEmployeeId === swap.requestingEmployeeId) {
      throw new SwapNotAuthorizedError(
        'Requesting employee cannot approve their own swap.',
      );
    }
    if (
      swap.targetEmployeeId &&
      swap.targetEmployeeId !== approvingEmployeeId
    ) {
      throw new SwapNotAuthorizedError(
        'Only the designated target employee can approve this swap.',
      );
    }

    // For open-target swaps, fix the target now.
    const updatedSwap = await tx.shiftSwapRequest.update({
      where: { id: swap.id },
      data: {
        status: 'APPROVED_BY_TARGET',
        targetEmployeeId: approvingEmployeeId,
      },
    });

    await writeAudit(tx, {
      organizationId: swap.organizationId,
      scheduleId: null,
      userId: input.actingUserId,
      actionType: 'UPDATE',
      entityType: 'ShiftSwapRequest',
      entityId: swap.id,
      before: swap,
      after: updatedSwap,
    });

    // No domain event on target approval (the workflow event is SWAP_APPROVED at manager finalization).
    return {
      publishPayload: null,
      result: {
        status: 'ok' as const,
        swap: { id: updatedSwap.id, status: updatedSwap.status },
      },
    };
  });

  if (committed.publishPayload) {
    void publishEvent(committed.publishPayload);
  }
  return committed.result;
}

export async function rejectSwap(
  input: RejectSwapInput,
  prisma: PrismaClient = defaultPrisma,
): Promise<{ status: 'ok'; swap: { id: string; status: string } }> {
  const committed = await prisma.$transaction(async (tx) => {
    const swap = await tx.shiftSwapRequest.findUnique({
      where: { id: input.swapId },
    });
    if (!swap) {
      throw new HttpError(404, 'SWAP_NOT_FOUND', 'Swap not found');
    }
    if (swap.status !== 'PENDING' && swap.status !== 'APPROVED_BY_TARGET') {
      throw new ConflictError(
        'SWAP_WRONG_STATE',
        `Swap is in state ${swap.status}; cannot reject.`,
        { currentStatus: swap.status },
      );
    }

    const updated = await tx.shiftSwapRequest.update({
      where: { id: swap.id },
      data: { status: 'REJECTED' },
    });

    await writeAudit(tx, {
      organizationId: swap.organizationId,
      scheduleId: null,
      userId: input.actingUserId,
      actionType: 'UPDATE',
      entityType: 'ShiftSwapRequest',
      entityId: swap.id,
      before: swap,
      after: { ...updated, reason: input.reason ?? null } as unknown as Prisma.InputJsonValue,
    });

    const ev = await writeEvent(tx, {
      organizationId: swap.organizationId,
      eventType: 'SWAP_REJECTED',
      aggregateType: 'ShiftSwapRequest',
      aggregateId: swap.id,
      payload: { reason: input.reason ?? null },
      userId: input.actingUserId,
    });

    return {
      publishPayload: {
        id: ev.id,
        organizationId: swap.organizationId,
        eventType: 'SWAP_REJECTED' as const,
        aggregateType: 'ShiftSwapRequest',
        aggregateId: swap.id,
        payload: { reason: input.reason ?? null },
        userId: input.actingUserId,
      },
      result: {
        status: 'ok' as const,
        swap: { id: updated.id, status: updated.status },
      },
    };
  });

  void publishEvent(committed.publishPayload);
  return committed.result;
}
