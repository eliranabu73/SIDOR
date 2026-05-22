import { prisma } from '../../db/prisma';

/**
 * Read-only summary of an employee's time-off requests + recent availability
 * rules. Powers the "מה ביקשתי" tab on /e/[token].
 */
export async function fetchEmployeeActivity(input: {
  employeeId: string;
  organizationId: string;
}) {
  const horizon = new Date(Date.now() + 60 * 86400000); // 60 days ahead
  const past = new Date(Date.now() - 30 * 86400000); // 30 days back

  const [timeOff, availability] = await Promise.all([
    prisma.employeeTimeOffRequest.findMany({
      where: {
        employeeId: input.employeeId,
        startAtUtc: { gte: past, lt: horizon },
      },
      orderBy: { startAtUtc: 'desc' },
      take: 20,
    }),
    prisma.employeeAvailabilityRule.findMany({
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

export async function createTimeOffRequest(input: {
  employeeId: string;
  organizationId: string;
  startsAt: Date;
  endsAt: Date;
  reason?: string;
  timezone?: string;
}) {
  if (input.endsAt <= input.startsAt) {
    throw Object.assign(new Error('תאריך סיום חייב להיות אחרי תאריך התחלה'), {
      statusCode: 400,
    });
  }
  // Make sure employee belongs to org (defence in depth)
  const emp = await prisma.employee.findFirst({
    where: { id: input.employeeId, organizationId: input.organizationId },
    select: { id: true, defaultTimezone: true },
  });
  if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  return prisma.employeeTimeOffRequest.create({
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
export async function replaceAvailability(input: {
  employeeId: string;
  organizationId: string;
  rules: Array<{
    dayOfWeek: number;
    startLocalTime: string;
    endLocalTime: string;
    type: 'AVAILABLE' | 'UNAVAILABLE' | 'PREFERRED';
  }>;
  timezone?: string;
}) {
  const emp = await prisma.employee.findFirst({
    where: { id: input.employeeId, organizationId: input.organizationId },
    select: { id: true, defaultTimezone: true },
  });
  if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  const tz = input.timezone ?? emp.defaultTimezone ?? 'Asia/Jerusalem';
  return prisma.$transaction(async (tx) => {
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
