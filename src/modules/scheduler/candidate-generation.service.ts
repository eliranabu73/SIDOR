import type { PrismaClient, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma as defaultPrisma, ensureTx } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { validateAssignment } from '../rules/validator.service';
import {
  mergeRulesSnapshot,
  parseLaborRulesJson,
} from '../rules/snapshot.service';
import { computeAvailabilityCoverage } from '../availability/availability.service';
import { classifyShiftStartLocal } from '../../shared/shift-classification';
import type { ValidationContext } from '../rules/types';
import type { Candidate, CandidateSignals } from './types';

const PREFERRED_WEEKLY_MINUTES_DEFAULT = 40 * 60;

/**
 * Generates the full (shift, employee) candidate matrix for a schedule.
 *
 * For each pair we:
 *   1. Build a ValidationContext (reusing the same loader pattern as
 *      assignments.service, but in bulk).
 *   2. Run the Fast Rules validator. If `blocked` → mark ineligible and skip
 *      scoring. Otherwise keep it with warnings attached.
 *   3. Derive scoring signals (availability ratio, preference, fairness,
 *      weekly hours delta, weekend/night counters, classification flags).
 *
 * The output is intentionally NOT persisted to `SchedulingCandidate` here —
 * the SchedulerService owns the persistence call. Keeps the generator pure
 * and easy to test.
 */
export async function generateCandidates(
  scheduleId: string,
  prisma: Db = defaultPrisma,
): Promise<Candidate[]> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { organization: true, location: true },
  });
  if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);

  const shifts = await prisma.shift.findMany({
    where: { scheduleId },
    orderBy: { startAtUtc: 'asc' },
  });
  if (shifts.length === 0) return [];

  const employees = await prisma.employee.findMany({
    where: { organizationId: schedule.organizationId, isActive: true },
    include: { roles: true, preferences: true },
  });

  // bulk fetches keyed by employeeId — avoid N+1
  const empIds = employees.map((e) => e.id);
  const [availability, allAssignments, allMetrics, shiftPrefs] = await Promise.all([
    prisma.employeeAvailabilityRule.findMany({
      where: { employeeId: { in: empIds } },
    }),
    prisma.shiftAssignment.findMany({
      where: { employeeId: { in: empIds } },
      include: { shift: true },
    }),
    prisma.employeeScheduleMetrics.findMany({
      where: { employeeId: { in: empIds } },
    }),
    prisma.employeeShiftPreference.findMany({
      where: { employeeId: { in: empIds } },
    }),
  ]);

  const availByEmp = groupBy(availability, (r) => r.employeeId);
  const assignsByEmp = groupBy(allAssignments, (a) => a.employeeId);
  const prefsByEmp = groupBy(shiftPrefs, (p) => p.employeeId);

  const rulesSnapshot = mergeRulesSnapshot(
    parseLaborRulesJson(schedule.organization.laborRulesJsonb),
    parseLaborRulesJson(schedule.location?.laborRulesJsonb),
  );

  const candidates: Candidate[] = [];

  for (const shift of shifts) {
    for (const employee of employees) {
      const weekStartDate = DateTime.fromJSDate(shift.startAtUtc)
        .setZone(shift.timezone)
        .startOf('week')
        .toJSDate();
      const metrics =
        allMetrics.find(
          (m) =>
            m.employeeId === employee.id &&
            sameDay(m.weekStartDate, weekStartDate),
        ) ?? null;

      const ctx: ValidationContext = {
        shift,
        employee,
        availabilityRules: availByEmp.get(employee.id) ?? [],
        existingAssignments: assignsByEmp.get(employee.id) ?? [],
        rulesSnapshot,
        metrics,
        activeLockUserId: null,
        actingUserId: 'scheduler',
      };

      const validation = await validateAssignment(ctx);
      const eligible = validation.outcome !== 'blocked';

      const signals = computeSignals({
        shift,
        availabilityRules: ctx.availabilityRules,
        metrics,
        shiftPrefs: prefsByEmp.get(employee.id) ?? [],
        preferredWeeklyMinutes:
          employee.preferences?.preferredHoursPerWeek != null
            ? employee.preferences.preferredHoursPerWeek * 60
            : PREFERRED_WEEKLY_MINUTES_DEFAULT,
      });

      candidates.push({
        shiftId: shift.id,
        shift,
        employee,
        signals,
        eligible,
        warnings: validation.warnings,
        violations: validation.blocking,
      });
    }
  }

  return candidates;
}

/**
 * Persist the eligible candidates into `SchedulingCandidate`. Idempotent via
 * the `(shiftId, employeeId)` unique index. Called by SchedulerService after
 * scoring so we can store the final score, not just eligibility.
 */
export async function persistCandidates(
  rows: Array<{
    organizationId: string;
    shiftId: string;
    employeeId: string;
    eligibilityScore: number;
    violationsCount: number;
    warningsCount: number;
  }>,
  prisma: Db = defaultPrisma,
): Promise<number> {
  if (rows.length === 0) return 0;
  // Run upserts inside a (possibly outer-managed) transaction so RLS context
  // and atomicity hold.  ensureTx reuses an existing tx when one is passed in.
  await ensureTx(prisma, async (tx) => {
    for (const r of rows) {
      await tx.schedulingCandidate.upsert({
        where: {
          shiftId_employeeId: { shiftId: r.shiftId, employeeId: r.employeeId },
        },
        create: { ...r },
        update: {
          eligibilityScore: r.eligibilityScore,
          violationsCount: r.violationsCount,
          warningsCount: r.warningsCount,
          generatedAt: new Date(),
        },
      });
    }
  });
  return rows.length;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function computeSignals(args: {
  shift: Prisma.ShiftGetPayload<{}>;
  availabilityRules: Prisma.EmployeeAvailabilityRuleGetPayload<{}>[];
  metrics: Prisma.EmployeeScheduleMetricsGetPayload<{}> | null;
  shiftPrefs: Prisma.EmployeeShiftPreferenceGetPayload<{}>[];
  preferredWeeklyMinutes: number;
}): CandidateSignals {
  const { shift, availabilityRules, metrics, shiftPrefs, preferredWeeklyMinutes } = args;

  const coverage = computeAvailabilityCoverage({
    startAtUtc: shift.startAtUtc,
    endAtUtc: shift.endAtUtc,
    timezone: shift.timezone,
    rules: availabilityRules,
  });

  const classification = classifyShiftStartLocal(shift.startAtUtc, shift.timezone);

  const shiftMinutes = Math.round(
    (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60000,
  );
  const projectedMinutes = (metrics?.totalScheduledMinutes ?? 0) + shiftMinutes;
  const weeklyHoursDelta = projectedMinutes - preferredWeeklyMinutes;

  // pick the highest preference-score window that overlaps the shift's local
  // start hour (good-enough heuristic without re-slicing the full window)
  const local = DateTime.fromJSDate(shift.startAtUtc).setZone(shift.timezone);
  const dayOfWeek = local.weekday === 7 ? 0 : local.weekday;
  const localMinutes = local.hour * 60 + local.minute;
  const matchingPref = shiftPrefs
    .filter((p) => p.dayOfWeek === dayOfWeek)
    .filter((p) => withinHHmm(localMinutes, p.startLocalTime, p.endLocalTime))
    .reduce<number>((best, p) => Math.max(best, p.preferenceScore), 0);

  return {
    availabilityCoverage: coverage.coverageRatio,
    preferenceScore: matchingPref,
    fairnessScore: metrics?.fairnessScore ?? 0,
    weeklyHoursDelta,
    weekendShiftCount: metrics?.weekendShiftCount ?? 0,
    nightShiftCount: metrics?.nightShiftCount ?? 0,
    isNightShift: classification.isNight,
    isWeekendShift: classification.isWeekend,
  };
}

function groupBy<T, K>(arr: T[], keyFn: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of arr) {
    const k = keyFn(x);
    const bucket = out.get(k);
    if (bucket) bucket.push(x);
    else out.set(k, [x]);
  }
  return out;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function withinHHmm(localMinutes: number, start: string, end: string): boolean {
  const s = parseHHmm(start);
  const e = parseHHmm(end);
  return localMinutes >= s && localMinutes < e;
}

function parseHHmm(t: string): number {
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}
