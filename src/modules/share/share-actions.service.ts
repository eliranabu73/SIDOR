import { prisma as defaultPrisma, ensureTx, withOrgContext } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { verifyEmployeeToken } from './share.service';

/**
 * Token-intent: employee acknowledges a published shift.
 * No dedicated `confirmedAt` column exists on ShiftAssignment, so we persist
 * the ack in MessageDelivery with channel="employee_ack" + status="confirmed".
 * Idempotent: returns the existing row if one is already logged.
 */
export async function confirmShiftAssignment(
  input: {
    employeeId: string;
    organizationId: string;
    shiftId: string;
  },
  db: Db = defaultPrisma,
) {
  const assignment = await db.shiftAssignment.findFirst({
    where: { shiftId: input.shiftId, employeeId: input.employeeId },
    include: { shift: { select: { id: true, organizationId: true, startAtUtc: true, endAtUtc: true } } },
  });
  if (!assignment) {
    throw Object.assign(new Error('משמרת לא נמצאה'), { statusCode: 404 });
  }
  if (assignment.shift.organizationId !== input.organizationId) {
    throw Object.assign(new Error('Org mismatch'), { statusCode: 403 });
  }

  const existing = await db.messageDelivery.findFirst({
    where: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      channel: 'employee_ack',
      status: 'confirmed',
      payload: { path: ['shiftId'], equals: input.shiftId },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return {
      id: existing.id,
      shiftId: input.shiftId,
      assignmentId: assignment.id,
      confirmedAt: existing.createdAt.toISOString(),
      alreadyConfirmed: true,
    };
  }

  const row = await db.messageDelivery.create({
    data: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      channel: 'employee_ack',
      templateName: 'shift_confirm',
      payload: {
        shiftId: input.shiftId,
        assignmentId: assignment.id,
        startsAt: assignment.shift.startAtUtc.toISOString(),
        endsAt: assignment.shift.endAtUtc.toISOString(),
      },
      status: 'confirmed',
    },
    select: { id: true, createdAt: true },
  });
  return {
    id: row.id,
    shiftId: input.shiftId,
    assignmentId: assignment.id,
    confirmedAt: row.createdAt.toISOString(),
    alreadyConfirmed: false,
  };
}

/**
 * Token-intent: employee requests a swap from their shift X (fromShiftId)
 * optionally pointing at another shift Y (toShiftId) and/or a free-text reason.
 * Mirrors createSwapRequest but accepts shift-ids (not assignment-ids) — we
 * resolve the requesting employee's assignment server-side so the public
 * surface only needs the shift uuid the employee already sees on their card.
 *
 * Extra context (toShiftId, reason, optional targetEmployeeId) lives in a
 * paired MessageDelivery row (channel="swap_request_meta") since the
 * ShiftSwapRequest schema doesn't carry those columns today.
 */
export async function requestSwapWithReason(
  input: {
    employeeId: string;
    organizationId: string;
    fromShiftId: string;
    toShiftId?: string;
    reason?: string;
  },
  db: Db = defaultPrisma,
) {
  const fromAssignment = await db.shiftAssignment.findFirst({
    where: { shiftId: input.fromShiftId, employeeId: input.employeeId },
    include: { shift: { select: { organizationId: true } } },
  });
  if (!fromAssignment) {
    throw Object.assign(new Error('המשמרת לא משויכת אליך'), { statusCode: 403 });
  }
  if (fromAssignment.shift.organizationId !== input.organizationId) {
    throw Object.assign(new Error('Org mismatch'), { statusCode: 403 });
  }

  // Optional target shift → pick the assignee on that shift as targetEmployeeId.
  let targetEmployeeId: string | null = null;
  if (input.toShiftId) {
    const targetAssignment = await db.shiftAssignment.findFirst({
      where: {
        shiftId: input.toShiftId,
        assignmentStatus: { in: ['CONFIRMED', 'PROPOSED'] },
        shift: { organizationId: input.organizationId },
      },
      select: { employeeId: true },
    });
    if (targetAssignment && targetAssignment.employeeId !== input.employeeId) {
      targetEmployeeId = targetAssignment.employeeId;
    }
  }

  return ensureTx(db, async (tx) => {
    const existing = await tx.shiftSwapRequest.findFirst({
      where: {
        sourceAssignmentId: fromAssignment.id,
        status: 'PENDING',
      },
    });
    const swap =
      existing ??
      (await tx.shiftSwapRequest.create({
        data: {
          organizationId: input.organizationId,
          sourceAssignmentId: fromAssignment.id,
          requestingEmployeeId: input.employeeId,
          status: 'PENDING',
          ...(targetEmployeeId ? { targetEmployeeId } : {}),
        },
      }));

    // Persist reason / toShiftId metadata even if we returned an existing
    // request — frontend may have collected new context.
    if (input.reason || input.toShiftId) {
      await tx.messageDelivery.create({
        data: {
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          channel: 'swap_request_meta',
          templateName: 'swap_request',
          payload: {
            swapRequestId: swap.id,
            fromShiftId: input.fromShiftId,
            toShiftId: input.toShiftId ?? null,
            reason: input.reason ?? null,
          },
          status: 'logged',
        },
      });
    }

    return swap;
  });
}

/**
 * Read-only summary of an employee's time-off requests + recent availability
 * rules. Powers the "מה ביקשתי" tab on /e/[token].
 */
export async function fetchEmployeeActivity(
  input: {
    employeeId: string;
    organizationId: string;
  },
  db: Db = defaultPrisma,
) {
  const horizon = new Date(Date.now() + 60 * 86400000); // 60 days ahead
  const past = new Date(Date.now() - 30 * 86400000); // 30 days back

  const [timeOff, availability] = await Promise.all([
    db.employeeTimeOffRequest.findMany({
      where: {
        employeeId: input.employeeId,
        startAtUtc: { gte: past, lt: horizon },
      },
      orderBy: { startAtUtc: 'desc' },
      take: 20,
    }),
    db.employeeAvailabilityRule.findMany({
      where: { employeeId: input.employeeId },
      orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
    }),
  ]);

  return {
    timeOff: timeOff.map((t) => ({
      id: t.id,
      startsAt: t.startAtUtc.toISOString(),
      endsAt: t.endAtUtc.toISOString(),
      reason: t.reason,
      status: t.status.toLowerCase(),
    })),
    availability: availability.map((a) => ({
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startLocalTime: a.startLocalTime,
      endLocalTime: a.endLocalTime,
      type: a.availabilityType.toLowerCase(),
    })),
  };
}

export async function createTimeOffRequest(
  input: {
    employeeId: string;
    organizationId: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string;
    timezone?: string;
  },
  db: Db = defaultPrisma,
) {
  if (input.endsAt <= input.startsAt) {
    throw Object.assign(new Error('תאריך סיום חייב להיות אחרי תאריך התחלה'), {
      statusCode: 400,
    });
  }
  // Make sure employee belongs to org (defence in depth)
  const emp = await db.employee.findFirst({
    where: { id: input.employeeId, organizationId: input.organizationId },
    select: { id: true, defaultTimezone: true },
  });
  if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  return db.employeeTimeOffRequest.create({
    data: {
      employeeId: emp.id,
      startAtUtc: input.startsAt,
      endAtUtc: input.endsAt,
      reason: input.reason ?? null,
      status: 'PENDING',
      timezone: input.timezone ?? emp.defaultTimezone ?? 'Asia/Jerusalem',
    },
  });
}

/**
 * Replace the employee's weekly availability with a fresh set of rules.
 * Frontend posts the full week as { dayOfWeek, startLocalTime, endLocalTime, type }.
 */
/**
 * Aggregated read for the Employee Self-Service mini-app (WS-I).
 * Returns identity + upcoming shifts (14d) + past-week minutes + month summary +
 * recent time-off requests.
 *
 * Token verification is performed here so the route layer stays thin and
 * cannot accidentally bypass the signature check.
 */
export async function getEmployeePortalData(input: { token: string }) {
  const decoded = verifyEmployeeToken(input.token);
  if (!decoded) {
    throw Object.assign(new Error('הקישור אינו תקף או שפג תוקפו'), {
      statusCode: 401,
    });
  }
  const { employeeId, organizationId } = decoded;

  return withOrgContext(organizationId).query(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, organizationId, isActive: true },
      select: {
        id: true,
        fullName: true,
        weeklyRestDay: true,
        defaultLocation: { select: { name: true } },
      },
    });
    if (!employee) {
      throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [upcoming, pastWeek, monthAssignments, timeOff] = await Promise.all([
      tx.shiftAssignment.findMany({
        where: {
          employeeId,
          shift: {
            organizationId,
            startAtUtc: { gte: now, lt: horizon },
            status: { not: 'CANCELLED' },
          },
          assignmentStatus: { in: ['CONFIRMED', 'COMPLETED', 'PROPOSED'] },
        },
        include: { shift: { include: { role: true, location: true } } },
        orderBy: { shift: { startAtUtc: 'asc' } },
      }),
      tx.shiftAssignment.findMany({
        where: {
          employeeId,
          shift: {
            organizationId,
            startAtUtc: { gte: weekAgo, lt: now },
            status: { not: 'CANCELLED' },
          },
          assignmentStatus: { in: ['CONFIRMED', 'COMPLETED'] },
        },
        include: { shift: { select: { startAtUtc: true, endAtUtc: true } } },
      }),
      tx.shiftAssignment.findMany({
        where: {
          employeeId,
          shift: {
            organizationId,
            startAtUtc: { gte: monthStart, lt: monthEnd },
            status: { not: 'CANCELLED' },
          },
          assignmentStatus: { in: ['CONFIRMED', 'COMPLETED'] },
        },
        include: { shift: { select: { startAtUtc: true, endAtUtc: true } } },
      }),
      tx.employeeTimeOffRequest.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const minutesBetween = (a: Date, b: Date) =>
      Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

    const pastWeekMinutes = pastWeek.reduce(
      (acc, a) => acc + minutesBetween(a.shift.startAtUtc, a.shift.endAtUtc),
      0,
    );
    const monthMinutes = monthAssignments.reduce(
      (acc, a) => acc + minutesBetween(a.shift.startAtUtc, a.shift.endAtUtc),
      0,
    );

    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        defaultLocationName: employee.defaultLocation?.name ?? null,
        weeklyRestDay: employee.weeklyRestDay,
      },
      upcomingShifts: upcoming.map((a) => ({
        id: a.shift.id,
        assignmentId: a.id,
        startAt: a.shift.startAtUtc.toISOString(),
        endAt: a.shift.endAtUtc.toISOString(),
        role: a.shift.role?.name ?? null,
        location: a.shift.location?.name ?? null,
        status: a.assignmentStatus.toLowerCase(),
      })),
      pastWeekMinutes,
      monthSummary: {
        totalHours: Math.round((monthMinutes / 60) * 10) / 10,
        totalShifts: monthAssignments.length,
      },
      timeOffRequests: timeOff.map((t) => ({
        id: t.id,
        startsAt: t.startAtUtc.toISOString(),
        endsAt: t.endAtUtc.toISOString(),
        reason: t.reason,
        status: t.status.toLowerCase(),
        createdAt: t.createdAt.toISOString(),
      })),
    };
  });
}

/**
 * Token-gated time-off submission used by the Employee mini-app.
 * Accepts ISO date strings (start/end). Reuses createTimeOffRequest internals.
 */
export async function requestTimeOffFromShare(input: {
  token: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) {
  const decoded = verifyEmployeeToken(input.token);
  if (!decoded) {
    throw Object.assign(new Error('הקישור אינו תקף או שפג תוקפו'), {
      statusCode: 401,
    });
  }
  const startsAt = new Date(input.startDate);
  const endsAt = new Date(input.endDate);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw Object.assign(new Error('Invalid date'), { statusCode: 400 });
  }
  return withOrgContext(decoded.organizationId).query((tx) => {
    const args: Parameters<typeof createTimeOffRequest>[0] = {
      employeeId: decoded.employeeId,
      organizationId: decoded.organizationId,
      startsAt,
      endsAt,
    };
    if (input.reason) args.reason = input.reason;
    return createTimeOffRequest(args, tx);
  });
}

export async function replaceAvailability(
  input: {
    employeeId: string;
    organizationId: string;
    rules: Array<{
      dayOfWeek: number;
      startLocalTime: string;
      endLocalTime: string;
      type: 'AVAILABLE' | 'UNAVAILABLE' | 'PREFERRED';
    }>;
    timezone?: string;
  },
  db: Db = defaultPrisma,
) {
  const emp = await db.employee.findFirst({
    where: { id: input.employeeId, organizationId: input.organizationId },
    select: { id: true, defaultTimezone: true },
  });
  if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  const tz = input.timezone ?? emp.defaultTimezone ?? 'Asia/Jerusalem';
  return ensureTx(db, async (tx) => {
    await tx.employeeAvailabilityRule.deleteMany({
      where: { employeeId: emp.id },
    });
    if (input.rules.length === 0) return [];
    await tx.employeeAvailabilityRule.createMany({
      data: input.rules.map((r) => ({
        employeeId: emp.id,
        dayOfWeek: r.dayOfWeek,
        startLocalTime: r.startLocalTime,
        endLocalTime: r.endLocalTime,
        availabilityType: r.type,
        timezone: tz,
      })),
    });
    return tx.employeeAvailabilityRule.findMany({
      where: { employeeId: emp.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
    });
  });
}
