import { prisma } from '../../db/prisma';

/**
 * Suggest candidate employees who could cover the shift attached to
 * `sourceAssignmentId`. The cheap heuristic: same org, active, has the shift's
 * role, has no overlapping confirmed assignment.
 *
 * Future: integrate the rules engine for proper feasibility.
 */
export async function suggestSwapCandidates(input: {
  organizationId: string;
  sourceAssignmentId: string;
}) {
  const src = await prisma.shiftAssignment.findFirst({
    where: { id: input.sourceAssignmentId },
    include: {
      shift: { include: { role: true } },
      employee: { select: { id: true } },
    },
  });
  if (!src) throw Object.assign(new Error('Assignment not found'), { statusCode: 404 });
  if (src.shift.organizationId !== input.organizationId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  const roleId = src.shift.roleId;
  const startsAt = src.shift.startAtUtc;
  const endsAt = src.shift.endAtUtc;

  const candidatePool = await prisma.employee.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      id: { not: src.employee.id },
      ...(roleId
        ? { roles: { some: { roleId } } }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      assignments: {
        where: {
          assignmentStatus: { in: ['CONFIRMED', 'PROPOSED'] },
          shift: {
            organizationId: input.organizationId,
            status: { not: 'CANCELLED' },
            // overlap test: shift starts before requested end AND ends after requested start
            startAtUtc: { lt: endsAt },
            endAtUtc: { gt: startsAt },
          },
        },
        select: { id: true },
      },
    },
  });

  return candidatePool
    .map((e) => ({
      employeeId: e.id,
      fullName: e.fullName,
      phone: e.phone,
      conflicting: e.assignments.length > 0,
    }))
    // Best candidates first (no conflict).
    .sort((a, b) => Number(a.conflicting) - Number(b.conflicting));
}

export async function createSwapRequest(input: {
  organizationId: string;
  requestingEmployeeId: string;
  sourceAssignmentId: string;
}) {
  // Verify the assignment belongs to the requester
  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      id: input.sourceAssignmentId,
      employeeId: input.requestingEmployeeId,
    },
    include: { shift: { select: { organizationId: true } } },
  });
  if (!assignment) {
    throw Object.assign(new Error('Assignment not yours'), { statusCode: 403 });
  }
  if (assignment.shift.organizationId !== input.organizationId) {
    throw Object.assign(new Error('Org mismatch'), { statusCode: 403 });
  }

  // Avoid duplicate pending requests for the same assignment
  const existing = await prisma.shiftSwapRequest.findFirst({
    where: { sourceAssignmentId: input.sourceAssignmentId, status: 'PENDING' },
  });
  if (existing) return existing;

  return prisma.shiftSwapRequest.create({
    data: {
      organizationId: input.organizationId,
      sourceAssignmentId: input.sourceAssignmentId,
      requestingEmployeeId: input.requestingEmployeeId,
      status: 'PENDING',
    },
  });
}

export async function listPendingSwaps(organizationId: string) {
  const rows = await prisma.shiftSwapRequest.findMany({
    where: { organizationId, status: 'PENDING' },
    include: {
      sourceAssignment: {
        include: {
          shift: { include: { role: true, location: true } },
        },
      },
      requestingEmployee: { select: { id: true, fullName: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    requester: r.requestingEmployee,
    shift: {
      id: r.sourceAssignment.shift.id,
      startsAt: r.sourceAssignment.shift.startAtUtc.toISOString(),
      endsAt: r.sourceAssignment.shift.endAtUtc.toISOString(),
      role: r.sourceAssignment.shift.role?.name ?? null,
      location: r.sourceAssignment.shift.location?.name ?? null,
    },
    assignmentId: r.sourceAssignmentId,
  }));
}

export async function approveSwap(input: {
  organizationId: string;
  swapId: string;
  targetEmployeeId: string;
  managerUserId: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const swap = await tx.shiftSwapRequest.findFirst({
      where: { id: input.swapId, organizationId: input.organizationId, status: 'PENDING' },
      include: { sourceAssignment: true },
    });
    if (!swap) {
      throw Object.assign(new Error('Swap not found / already handled'), { statusCode: 404 });
    }

    // Reassign: update the existing assignment's employee
    await tx.shiftAssignment.update({
      where: { id: swap.sourceAssignmentId },
      data: { employeeId: input.targetEmployeeId, assignmentStatus: 'CONFIRMED' },
    });
    return tx.shiftSwapRequest.update({
      where: { id: swap.id },
      data: {
        status: 'APPROVED_BY_MANAGER',
        targetEmployeeId: input.targetEmployeeId,
        approvedByManagerId: input.managerUserId,
      },
    });
  });
}

export async function rejectSwap(input: {
  organizationId: string;
  swapId: string;
}) {
  const swap = await prisma.shiftSwapRequest.findFirst({
    where: { id: input.swapId, organizationId: input.organizationId, status: 'PENDING' },
  });
  if (!swap) {
    throw Object.assign(new Error('Swap not found / already handled'), { statusCode: 404 });
  }
  return prisma.shiftSwapRequest.update({
    where: { id: swap.id },
    data: { status: 'REJECTED' },
  });
}
