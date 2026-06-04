import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';

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
export async function fetchLaborCostForWeek(
  input: {
    organizationId: string;
    weekStart: Date;
  },
  db: Db = defaultPrisma,
) {
  const start = input.weekStart;
  const end = new Date(start.getTime() + 7 * 86400000);

  // All shifts in the week (live, not cancelled), with assignments + employees.
  // hourlyRate may not exist in DB yet (migration pending) — try with it
  // first; on column-missing error, fall back to a query without it.
  type ShiftWithRels = Awaited<ReturnType<typeof loadShifts>>;
  async function loadShifts(includeRate: boolean) {
    return db.shift.findMany({
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

  // Money is accumulated as INTEGER agorot and time as INTEGER minutes — never
  // floats — so summing many shifts cannot drift (this is wages). We convert to
  // ILS / hours only at the very end (display rounding), never mid-accumulation.
  const employeesById = new Map<
    string,
    {
      employeeId: string;
      fullName: string;
      hourlyRate: number | null;
      minutes: number;
      agorot: number;
    }
  >();
  const byDay = new Map<string, { minutes: number; agorot: number; shifts: number }>();
  const byRole = new Map<string, { minutes: number; agorot: number }>();
  const byLocation = new Map<string, { minutes: number; agorot: number }>();

  let totalMinutes = 0;
  let totalAgorot = 0;
  let uncoveredMinutes = 0; // minutes of shifts not assigned yet
  let openShifts = 0;
  let shiftsCount = 0;
  let employeesWithoutRate = 0;
  const seenWithoutRate = new Set<string>();
  const DEFAULT_RATE_AGOROT = DEFAULT_HOURLY_RATE_ILS * 100;

  // cost (agorot) for `minutes` worked at `rateAgorot` per hour, rounded once.
  const costAgorot = (minutes: number, rateAgorot: number): number =>
    Math.round((minutes * rateAgorot) / 60);

  for (const s of shifts) {
    shiftsCount += 1;
    // Clamp to >= 0: a malformed shift with end before start must never produce
    // a NEGATIVE wage that silently cancels real pay from the weekly total.
    const durationMinutes = Math.max(
      0,
      Math.round((s.endAtUtc.getTime() - s.startAtUtc.getTime()) / 60_000),
    );
    const required = s.requiredEmployeeCount ?? 1;
    const dayKey = s.startAtUtc.toISOString().slice(0, 10);
    const roleKey = s.role?.name ?? 'ללא תפקיד';
    const locKey = s.location?.name ?? 'ללא סניף';

    const assignmentCount = s.assignments.length;
    if (assignmentCount < required) {
      openShifts += required - assignmentCount;
      uncoveredMinutes += durationMinutes * (required - assignmentCount);
    }

    for (const a of s.assignments) {
      const empRate = (a.employee as { hourlyRate?: unknown }).hourlyRate;
      // A rate of 0 / null / undefined / NaN / negative means "NOT CONFIGURED".
      // Note: Prisma Decimal(0) is a truthy OBJECT, so a plain truthiness check
      // would silently bypass the fallback and bill ₪0 — coerce to Number and
      // require a finite, strictly-positive value. This also blocks NaN from
      // ever poisoning money math (totalAgorot/agorot).
      const n = Number(empRate);
      const valid = Number.isFinite(n) && n > 0;
      const rateAgorot = valid ? Math.round(n * 100) : DEFAULT_RATE_AGOROT;
      if (!valid && !seenWithoutRate.has(a.employee.id)) {
        seenWithoutRate.add(a.employee.id);
        employeesWithoutRate += 1;
      }
      const agorot = costAgorot(durationMinutes, rateAgorot);

      totalMinutes += durationMinutes;
      totalAgorot += agorot;

      const e = employeesById.get(a.employee.id) ?? {
        employeeId: a.employee.id,
        fullName: a.employee.fullName,
        hourlyRate: valid ? n : null,
        minutes: 0,
        agorot: 0,
      };
      e.minutes += durationMinutes;
      e.agorot += agorot;
      employeesById.set(a.employee.id, e);

      const day = byDay.get(dayKey) ?? { minutes: 0, agorot: 0, shifts: 0 };
      day.minutes += durationMinutes;
      day.agorot += agorot;
      byDay.set(dayKey, day);

      const role = byRole.get(roleKey) ?? { minutes: 0, agorot: 0 };
      role.minutes += durationMinutes;
      role.agorot += agorot;
      byRole.set(roleKey, role);

      const loc = byLocation.get(locKey) ?? { minutes: 0, agorot: 0 };
      loc.minutes += durationMinutes;
      loc.agorot += agorot;
      byLocation.set(locKey, loc);
    }

    // Ensure day key exists even when no assignments yet
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { minutes: 0, agorot: 0, shifts: 0 });
    }
    // NOTE: `shifts` counts ALL shifts in the day (including unassigned/open
    // ones), whereas `minutes`/`agorot` above accumulate per assignment (only
    // assigned work). These bases are intentionally asymmetric — consumers must
    // NOT derive a cost-per-shift from these two numbers, as it would be skewed
    // by unstaffed shifts that contribute to the count but not to hours/cost.
    byDay.get(dayKey)!.shifts += 1;
  }

  // Overtime — employees over 42h (2520 min) this week (Israeli weekly limit).
  const OVERTIME_MINUTES = 42 * 60;
  const overtimeEmployees = [...employeesById.values()].filter(
    (e) => e.minutes > OVERTIME_MINUTES,
  );

  const hoursOf = (minutes: number) => round(minutes / 60);
  const ilsOf = (agorot: number) => agorot / 100; // exact 2-decimal ILS

  return {
    weekStart: start.toISOString(),
    currency: 'ILS' as const,
    totals: {
      hours: hoursOf(totalMinutes),
      cost: ilsOf(totalAgorot),
      shifts: shiftsCount,
      uncoveredHours: hoursOf(uncoveredMinutes),
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
        hours: hoursOf(e.minutes),
        cost: ilsOf(e.agorot),
        isOvertime: e.minutes > OVERTIME_MINUTES,
      }))
      .sort((a, b) => b.cost - a.cost),
    perDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        date: day,
        hours: hoursOf(v.minutes),
        cost: ilsOf(v.agorot),
        shifts: v.shifts,
      })),
    perRole: [...byRole.entries()].map(([name, v]) => ({
      name,
      hours: hoursOf(v.minutes),
      cost: ilsOf(v.agorot),
    })),
    perLocation: [...byLocation.entries()].map(([name, v]) => ({
      name,
      hours: hoursOf(v.minutes),
      cost: ilsOf(v.agorot),
    })),
    defaultHourlyRate: DEFAULT_HOURLY_RATE_ILS,
  };
}

function round(n: number, places = 2): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}
