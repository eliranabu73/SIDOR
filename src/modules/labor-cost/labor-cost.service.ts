import { prisma } from '../../db/prisma';

/**
 * Israeli minimum wage (gross) — 2026 estimate. Used as fallback when an
 * employee has no hourlyRate set, so the dashboard is useful from day 1.
 */
const DEFAULT_HOURLY_RATE_ILS = 35;

/**
 * Aggregate labor cost for a given week.
 * - Pulls every assignment whose shift is in [weekStart, weekStart+7d)
 * - Hours = shift duration × required count for unassigned; or 1 per assignment
 * - Cost = hours × employee.hourlyRate (fallback to DEFAULT_HOURLY_RATE_ILS)
 */
export async function fetchLaborCostForWeek(input: {
  organizationId: string;
  weekStart: Date;
}) {
  const start = input.weekStart;
  const end = new Date(start.getTime() + 7 * 86400000);

  // All shifts in the week (live, not cancelled), with assignments + employees.
  // hourlyRate may not exist in DB yet (migration pending) — try with it
  // first; on column-missing error, fall back to a query without it.
  type ShiftWithRels = Awaited<ReturnType<typeof loadShifts>>;
  async function loadShifts(includeRate: boolean) {
    return prisma.shift.findMany({
      where: {
        organizationId: input.organizationId,
        startAtUtc: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
      include: {
        role: { select: { name: true } },
        location: { select: { name: true } },
        assignments: {
          where: { assignmentStatus: { in: ['CONFIRMED', 'COMPLETED', 'PROPOSED'] } },
          include: {
            employee: includeRate
              ? { select: { id: true, fullName: true, hourlyRate: true } }
              : { select: { id: true, fullName: true } },
          },
        },
      },
    });
  }
  let shifts: ShiftWithRels;
  try {
    shifts = await loadShifts(true);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2022') {
      // Column doesn't exist yet — degrade gracefully to default rate for everyone.
      shifts = await loadShifts(false);
    } else {
      throw err;
    }
  }

  const employeesById = new Map<
    string,
    {
      employeeId: string;
      fullName: string;
      hourlyRate: number | null;
      hours: number;
      cost: number;
    }
  >();
  const byDay = new Map<string, { hours: number; cost: number; shifts: number }>();
  const byRole = new Map<string, { hours: number; cost: number }>();
  const byLocation = new Map<string, { hours: number; cost: number }>();

  let totalHours = 0;
  let totalCost = 0;
  let uncoveredHours = 0; // hours of shifts not assigned yet
  let openShifts = 0;
  let shiftsCount = 0;
  let employeesWithoutRate = 0;
  const seenWithoutRate = new Set<string>();

  for (const s of shifts) {
    shiftsCount += 1;
    const durationHours =
      (s.endAtUtc.getTime() - s.startAtUtc.getTime()) / 3_600_000;
    const required = s.requiredEmployeeCount ?? 1;
    const dayKey = s.startAtUtc.toISOString().slice(0, 10);
    const roleKey = s.role?.name ?? 'ללא תפקיד';
    const locKey = s.location?.name ?? 'ללא סניף';

    const assignmentCount = s.assignments.length;
    if (assignmentCount < required) {
      openShifts += required - assignmentCount;
      uncoveredHours += durationHours * (required - assignmentCount);
    }

    for (const a of s.assignments) {
      const empRate = (a.employee as { hourlyRate?: unknown }).hourlyRate;
      const rate = empRate ? Number(empRate) : DEFAULT_HOURLY_RATE_ILS;
      if (!empRate && !seenWithoutRate.has(a.employee.id)) {
        seenWithoutRate.add(a.employee.id);
        employeesWithoutRate += 1;
      }
      const hours = durationHours;
      const cost = hours * rate;

      totalHours += hours;
      totalCost += cost;

      const e = employeesById.get(a.employee.id) ?? {
        employeeId: a.employee.id,
        fullName: a.employee.fullName,
        hourlyRate: empRate ? Number(empRate) : null,
        hours: 0,
        cost: 0,
      };
      e.hours += hours;
      e.cost += cost;
      employeesById.set(a.employee.id, e);

      const day = byDay.get(dayKey) ?? { hours: 0, cost: 0, shifts: 0 };
      day.hours += hours;
      day.cost += cost;
      byDay.set(dayKey, day);

      const role = byRole.get(roleKey) ?? { hours: 0, cost: 0 };
      role.hours += hours;
      role.cost += cost;
      byRole.set(roleKey, role);

      const loc = byLocation.get(locKey) ?? { hours: 0, cost: 0 };
      loc.hours += hours;
      loc.cost += cost;
      byLocation.set(locKey, loc);
    }

    // Ensure day key exists even when no assignments yet
    if (!byDay.has(dayKey)) {
      const day = { hours: 0, cost: 0, shifts: 0 };
      byDay.set(dayKey, day);
    }
    byDay.get(dayKey)!.shifts += 1;
  }

  // Overtime estimate — employees with > 42 hours this week (Israeli weekly limit)
  const overtimeEmployees = [...employeesById.values()].filter(
    (e) => e.hours > 42,
  );

  return {
    weekStart: start.toISOString(),
    currency: 'ILS' as const,
    totals: {
      hours: round(totalHours),
      cost: round(totalCost),
      shifts: shiftsCount,
      uncoveredHours: round(uncoveredHours),
      openShifts,
      employees: employeesById.size,
      overtimeEmployees: overtimeEmployees.length,
      employeesWithoutRate,
    },
    perEmployee: [...employeesById.values()]
      .map((e) => ({
        employeeId: e.employeeId,
        fullName: e.fullName,
        hourlyRate: e.hourlyRate,
        hours: round(e.hours),
        cost: round(e.cost),
        isOvertime: e.hours > 42,
      }))
      .sort((a, b) => b.cost - a.cost),
    perDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        date: day,
        hours: round(v.hours),
        cost: round(v.cost),
        shifts: v.shifts,
      })),
    perRole: [...byRole.entries()].map(([name, v]) => ({
      name,
      hours: round(v.hours),
      cost: round(v.cost),
    })),
    perLocation: [...byLocation.entries()].map(([name, v]) => ({
      name,
      hours: round(v.hours),
      cost: round(v.cost),
    })),
    defaultHourlyRate: DEFAULT_HOURLY_RATE_ILS,
  };
}

function round(n: number, places = 2): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}
