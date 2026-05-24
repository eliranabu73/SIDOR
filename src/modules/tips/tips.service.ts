/**
 * Tips Service — Israeli Tip Law 2022 (חוק הטיפים, תיקון מס' 19 לחוק שכר מינימום)
 *
 * Key rules implemented:
 *  1. Tips belong to employees — employer cannot keep them.
 *  2. Distribution is proportional to hours worked that shift/day.
 *  3. Only customer-facing (service) roles receive tips.
 *  4. All amounts stored in agorot (integer) — no floating-point money.
 *  5. Same pay period as the tips were received.
 */

import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { ensureTx } from '../../db/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

// ---------------------------------------------------------------------------
// Role eligibility — customer-facing keywords (Hebrew + English)
// ---------------------------------------------------------------------------

const TIP_ELIGIBLE_KEYWORDS = [
  'מלצר',
  'מלצרית',
  'ברמן',
  'ברמנית',
  'קופאי',
  'קופאית',
  'שירות',
  'service',
  'waiter',
  'waitress',
  'bartender',
  'cashier',
];

export function isTipEligibleRole(roleName: string): boolean {
  const lower = roleName.toLowerCase();
  return TIP_ELIGIBLE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TipDistributionPreview {
  employeeId: string;
  employeeName: string;
  shiftMinutes: number;
  amountAgorot: number;
}

export interface RecordTipPoolInput {
  organizationId: string;
  shiftDate: Date;
  locationId?: string;
  totalAgorot: number;
  note?: string;
  createdByUserId?: string;
}

export interface TipPoolsForPeriodInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  locationId?: string;
}

// ---------------------------------------------------------------------------
// calculateTipDistribution
// ---------------------------------------------------------------------------

/**
 * Calculate tip distribution proportional to hours worked for service staff
 * on a given shift date.
 *
 * Steps:
 *  1. Find all CONFIRMED/COMPLETED shift assignments for that date + org.
 *  2. Filter to tip-eligible roles (customer-facing).
 *  3. Calculate total minutes worked across all qualifying employees.
 *  4. Distribute totalAgorot proportionally.
 *  5. Round down per employee; add remainder to the highest-hours employee.
 */
export async function calculateTipDistribution(
  input: {
    organizationId: string;
    shiftDate: Date;
    locationId?: string;
    totalAgorot: number;
  },
  db: Db = defaultPrisma,
): Promise<TipDistributionPreview[]> {
  const { organizationId, shiftDate, locationId, totalAgorot } = input;

  // Build date window (full UTC day covering the local shiftDate).
  // We use localStartDate which is already stored as DATE in the schema.
  const dateStr = shiftDate.toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const assignments = await (db as AnyDb).shiftAssignment.findMany({
    where: {
      assignmentStatus: { in: ['CONFIRMED', 'COMPLETED'] },
      shift: {
        organizationId,
        localStartDate: {
          gte: dayStart,
          lte: dayEnd,
        },
        ...(locationId ? { locationId } : {}),
      },
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          roles: {
            include: {
              role: { select: { name: true } },
            },
          },
        },
      },
      shift: {
        select: {
          startAtUtc: true,
          endAtUtc: true,
        },
      },
    },
  });

  // Filter to tip-eligible employees and accumulate minutes per employee.
  const empMinutes = new Map<
    string,
    { employeeId: string; employeeName: string; minutes: number }
  >();

  for (const a of assignments) {
    const emp = a.employee;

    // Check if any of the employee's roles are tip-eligible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = (emp.roles as any[]).some((er: any) => isTipEligibleRole(er.role.name));
    if (!eligible) continue;

    const shiftMinutes = Math.max(
      0,
      Math.round(
        (a.shift.endAtUtc.getTime() - a.shift.startAtUtc.getTime()) / 60_000,
      ),
    );
    if (shiftMinutes === 0) continue;

    const existing = empMinutes.get(emp.id);
    if (existing) {
      existing.minutes += shiftMinutes;
    } else {
      empMinutes.set(emp.id, {
        employeeId: emp.id,
        employeeName: emp.fullName,
        minutes: shiftMinutes,
      });
    }
  }

  if (empMinutes.size === 0) return [];

  const entries = Array.from(empMinutes.values());
  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);

  if (totalMinutes === 0) return [];

  // Proportional distribution — floor each share, collect remainder.
  let distributed = 0;
  const result: TipDistributionPreview[] = entries.map((e) => {
    const share = Math.floor((e.minutes / totalMinutes) * totalAgorot);
    distributed += share;
    return {
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      shiftMinutes: e.minutes,
      amountAgorot: share,
    };
  });

  // Remainder goes to the employee with the most minutes (Israeli convention:
  // extra agorot to the person who worked the most).
  const remainder = totalAgorot - distributed;
  if (remainder > 0 && result.length > 0) {
    const maxIdx = result.reduce(
      (best, cur, idx) =>
        cur.shiftMinutes > (result[best]?.shiftMinutes ?? 0) ? idx : best,
      0,
    );
    const winner = result[maxIdx];
    if (winner) winner.amountAgorot += remainder;
  }

  return result.sort((a, b) => b.shiftMinutes - a.shiftMinutes);
}

// ---------------------------------------------------------------------------
// recordTipPool
// ---------------------------------------------------------------------------

/**
 * Persist a tip pool and its distributions in a single transaction.
 */
export async function recordTipPool(
  input: RecordTipPoolInput,
  db: Db = defaultPrisma,
) {
  const distributions = await calculateTipDistribution(
    {
      organizationId: input.organizationId,
      shiftDate: input.shiftDate,
      locationId: input.locationId,
      totalAgorot: input.totalAgorot,
    },
    db,
  );

  const dateStr = input.shiftDate.toISOString().slice(0, 10);
  const shiftDateNoon = new Date(`${dateStr}T12:00:00.000Z`);

  return ensureTx(db, async (tx) => {
    const pool = await (tx as AnyDb).tipPool.create({
      data: {
        organizationId: input.organizationId,
        shiftDate: shiftDateNoon,
        locationId: input.locationId ?? null,
        totalAgorot: input.totalAgorot,
        note: input.note ?? null,
        createdByUserId: input.createdByUserId ?? null,
        distributions: {
          create: distributions.map((d) => ({
            employeeId: d.employeeId,
            shiftMinutes: d.shiftMinutes,
            amountAgorot: d.amountAgorot,
          })),
        },
      },
      include: {
        distributions: {
          include: {
            employee: { select: { id: true, fullName: true } },
          },
        },
        location: { select: { id: true, name: true } },
      },
    });
    return pool;
  });
}

// ---------------------------------------------------------------------------
// getTipPoolsForPeriod
// ---------------------------------------------------------------------------

/**
 * Return all tip pools with their distributions for a payroll period.
 */
export async function getTipPoolsForPeriod(
  input: TipPoolsForPeriodInput,
  db: Db = defaultPrisma,
) {
  const { organizationId, periodStart, periodEnd, locationId } = input;

  return (db as AnyDb).tipPool.findMany({
    where: {
      organizationId,
      shiftDate: { gte: periodStart, lte: periodEnd },
      ...(locationId ? { locationId } : {}),
    },
    include: {
      distributions: {
        include: {
          employee: { select: { id: true, fullName: true } },
        },
        orderBy: { shiftMinutes: 'desc' },
      },
      location: { select: { id: true, name: true } },
    },
    orderBy: { shiftDate: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// getTipPool (single)
// ---------------------------------------------------------------------------

export async function getTipPool(id: string, db: Db = defaultPrisma) {
  return (db as AnyDb).tipPool.findUnique({
    where: { id },
    include: {
      distributions: {
        include: {
          employee: { select: { id: true, fullName: true } },
        },
        orderBy: { shiftMinutes: 'desc' },
      },
      location: { select: { id: true, name: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// deleteTipPool
// ---------------------------------------------------------------------------

export async function deleteTipPool(id: string, db: Db = defaultPrisma) {
  return (db as AnyDb).tipPool.delete({ where: { id } });
}
