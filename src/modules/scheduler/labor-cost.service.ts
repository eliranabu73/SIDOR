import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';

/**
 * Per-schedule labor cost report. All money values are agorot (integer
 * 1/100 ILS) so the caller never has to round floats. Hours stay float.
 *
 * Source of truth: ShiftAssignment × Shift duration × Employee.hourlyRate.
 * Skips assignments whose employee has no hourlyRate (returns `null` from
 * computeWeeklyCost if NO employee in the whole org has a rate yet — UI uses
 * that to hide the meter cleanly).
 */
export interface WeeklyCostReport {
  scheduleId: string;
  weekStart: string; // ISO date
  currency: 'ILS';
  totalAgorot: number;
  avgPerShiftAgorot: number;
  deltaAgorot: number; // current - previousWeek (negative = saved)
  previousTotalAgorot: number | null;
  perEmployee: Array<{
    employeeId: string;
    name: string;
    hours: number;
    agorot: number;
  }>;
  perShift: Array<{ shiftId: string; agorot: number }>;
  byDay: Array<{ dayIso: string; agorot: number }>;
}

const ASSIGNMENT_STATUSES = ['CONFIRMED', 'COMPLETED', 'PROPOSED'] as const;

interface ComputeOpts {
  organizationId: string;
  scheduleId: string;
}

/**
 * Compute labor cost aggregates for one schedule (one week).
 * Returns `null` when the org has no employees with hourlyRate set at all —
 * cost meter is meaningless in that case and the UI should hide.
 */
export async function computeWeeklyCost(
  opts: ComputeOpts,
  db: Db = defaultPrisma,
): Promise<WeeklyCostReport | null> {
  const schedule = await db.schedule.findFirst({
    where: { id: opts.scheduleId, organizationId: opts.organizationId },
    select: {
      id: true,
      organizationId: true,
      periodStartDate: true,
      periodEndDate: true,
    },
  });
  if (!schedule) return null;

  // Bail early if the whole org has zero rates — cost is meaningless.
  const anyRate = await db.employee.findFirst({
    where: { organizationId: opts.organizationId, hourlyRate: { not: null } },
    select: { id: true },
  });
  if (!anyRate) return null;

  const current = await aggregateForSchedule(db, opts.scheduleId);

  // Previous week comparison — same org, same length window shifted by 7 days
  // before periodStartDate. We can't assume a Schedule row exists for last
  // week, so we aggregate over shifts directly in that range.
  const periodStart = schedule.periodStartDate;
  const prevStart = new Date(periodStart.getTime() - 7 * 86400000);
  const prevEnd = periodStart;
  const prevTotal = await aggregateForRange(
    db,
    opts.organizationId,
    prevStart,
    prevEnd,
  );

  const shiftsWithCost = current.perShift.length;
  const avgPerShiftAgorot =
    shiftsWithCost > 0 ? Math.round(current.totalAgorot / shiftsWithCost) : 0;

  return {
    scheduleId: opts.scheduleId,
    weekStart: periodStart.toISOString(),
    currency: 'ILS',
    totalAgorot: current.totalAgorot,
    avgPerShiftAgorot,
    deltaAgorot: current.totalAgorot - (prevTotal ?? 0),
    previousTotalAgorot: prevTotal,
    perEmployee: current.perEmployee,
    perShift: current.perShift,
    byDay: current.byDay,
  };
}

interface InternalAggregate {
  totalAgorot: number;
  perEmployee: WeeklyCostReport['perEmployee'];
  perShift: WeeklyCostReport['perShift'];
  byDay: WeeklyCostReport['byDay'];
}

async function aggregateForSchedule(
  db: Db,
  scheduleId: string,
): Promise<InternalAggregate> {
  const shifts = await db.shift.findMany({
    where: {
      scheduleId,
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      startAtUtc: true,
      endAtUtc: true,
      assignments: {
        where: { assignmentStatus: { in: [...ASSIGNMENT_STATUSES] } },
        select: {
          employee: {
            select: { id: true, fullName: true, hourlyRate: true },
          },
        },
      },
    },
  });
  return aggregate(shifts);
}

async function aggregateForRange(
  db: Db,
  organizationId: string,
  start: Date,
  end: Date,
): Promise<number | null> {
  const shifts = await db.shift.findMany({
    where: {
      organizationId,
      startAtUtc: { gte: start, lt: end },
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      startAtUtc: true,
      endAtUtc: true,
      assignments: {
        where: { assignmentStatus: { in: [...ASSIGNMENT_STATUSES] } },
        select: {
          employee: {
            select: { id: true, fullName: true, hourlyRate: true },
          },
        },
      },
    },
  });
  if (shifts.length === 0) return null;
  return aggregate(shifts).totalAgorot;
}

type ShiftRow = {
  id: string;
  startAtUtc: Date;
  endAtUtc: Date;
  assignments: Array<{
    employee: {
      id: string;
      fullName: string;
      hourlyRate: import('@prisma/client').Prisma.Decimal | null;
    };
  }>;
};

function aggregate(shifts: ShiftRow[]): InternalAggregate {
  const perEmployee = new Map<
    string,
    { employeeId: string; name: string; hours: number; agorot: number }
  >();
  const perShift = new Map<string, number>();
  const byDay = new Map<string, number>();
  let totalAgorot = 0;

  for (const s of shifts) {
    const durationHours =
      (s.endAtUtc.getTime() - s.startAtUtc.getTime()) / 3_600_000;
    if (durationHours <= 0) continue;
    const dayIso = s.startAtUtc.toISOString().slice(0, 10);
    let shiftAgorot = 0;

    for (const a of s.assignments) {
      const rate = a.employee.hourlyRate;
      if (rate == null) continue; // skip — no rate
      const rateNum = Number(rate);
      if (!Number.isFinite(rateNum) || rateNum <= 0) continue;
      const agorot = Math.round(durationHours * rateNum * 100);

      shiftAgorot += agorot;
      totalAgorot += agorot;

      const existing = perEmployee.get(a.employee.id) ?? {
        employeeId: a.employee.id,
        name: a.employee.fullName,
        hours: 0,
        agorot: 0,
      };
      existing.hours += durationHours;
      existing.agorot += agorot;
      perEmployee.set(a.employee.id, existing);
    }

    if (shiftAgorot > 0) {
      perShift.set(s.id, shiftAgorot);
      byDay.set(dayIso, (byDay.get(dayIso) ?? 0) + shiftAgorot);
    }
  }

  return {
    totalAgorot,
    perEmployee: [...perEmployee.values()]
      .map((e) => ({
        employeeId: e.employeeId,
        name: e.name,
        hours: Math.round(e.hours * 100) / 100,
        agorot: e.agorot,
      }))
      .sort((a, b) => b.agorot - a.agorot),
    perShift: [...perShift.entries()]
      .map(([shiftId, agorot]) => ({ shiftId, agorot }))
      .sort((a, b) => b.agorot - a.agorot),
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayIso, agorot]) => ({ dayIso, agorot })),
  };
}
