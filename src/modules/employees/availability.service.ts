import { prisma as defaultPrisma, ensureTx } from '../../db/prisma.js';
import type { Db } from '../../db/prisma.js';
import { HttpError } from '../../shared/errors.js';

export type AvailabilityType = 'AVAILABLE' | 'UNAVAILABLE' | 'PREFERRED';

export interface AvailabilityRuleInput {
  dayOfWeek: number;
  startLocalTime: string; // "HH:mm:ss"
  endLocalTime: string;
  availabilityType: AvailabilityType;
}

export interface AvailabilityRuleOut {
  id: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  availabilityType: AvailabilityType;
  timezone: string;
}

async function assertEmployeeInOrg(
  db: Db,
  employeeId: string,
  orgId: string,
): Promise<{ id: string; defaultTimezone: string | null }> {
  const emp = await db.employee.findFirst({
    where: { id: employeeId, organizationId: orgId },
    select: { id: true, defaultTimezone: true },
  });
  if (!emp) {
    throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  }
  return emp;
}

export async function listAvailability(
  orgId: string,
  employeeId: string,
  db: Db = defaultPrisma,
): Promise<{ rules: AvailabilityRuleOut[] }> {
  await assertEmployeeInOrg(db, employeeId, orgId);
  const rows = await db.employeeAvailabilityRule.findMany({
    where: { employeeId },
    orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
  });
  return {
    rules: rows.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startLocalTime: r.startLocalTime,
      endLocalTime: r.endLocalTime,
      availabilityType: r.availabilityType as AvailabilityType,
      timezone: r.timezone,
    })),
  };
}

export async function replaceAvailabilityForManager(
  orgId: string,
  employeeId: string,
  rules: AvailabilityRuleInput[],
  db: Db = defaultPrisma,
): Promise<{ rules: AvailabilityRuleOut[] }> {
  const emp = await assertEmployeeInOrg(db, employeeId, orgId);
  const tz = emp.defaultTimezone ?? 'Asia/Jerusalem';

  const rows = await ensureTx(db, async (tx) => {
    await tx.employeeAvailabilityRule.deleteMany({ where: { employeeId } });
    if (rules.length > 0) {
      await tx.employeeAvailabilityRule.createMany({
        data: rules.map((r) => ({
          employeeId,
          dayOfWeek: r.dayOfWeek,
          startLocalTime: r.startLocalTime,
          endLocalTime: r.endLocalTime,
          availabilityType: r.availabilityType,
          timezone: tz,
        })),
      });
    }
    return tx.employeeAvailabilityRule.findMany({
      where: { employeeId },
      orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }],
    });
  });

  return {
    rules: rows.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startLocalTime: r.startLocalTime,
      endLocalTime: r.endLocalTime,
      availabilityType: r.availabilityType as AvailabilityType,
      timezone: r.timezone,
    })),
  };
}

export interface PreferencesPayload {
  maxHoursPerWeek?: number | null;
  preferredHoursPerWeek?: number | null;
  minShiftsPerWeek?: number | null;
  maxShiftsPerWeek?: number | null;
  preferredShiftsPerWeek?: number | null;
  prefersMornings?: boolean;
  prefersEvenings?: boolean;
  prefersWeekends?: boolean;
  avoidBackToBackShifts?: boolean;
  // Extended fields (added via migration 20260524100000)
  preferredShiftLength?: number | null;
  noWorkAfter?: string | null; // "HH:mm"
  noWorkBefore?: string | null;
  avoidWeekends?: boolean;
  avoidNightShifts?: boolean;
  notes?: string | null;
}

export async function getPreferences(
  orgId: string,
  employeeId: string,
  db: Db = defaultPrisma,
): Promise<PreferencesPayload | null> {
  await assertEmployeeInOrg(db, employeeId, orgId);
  const row = await db.employeePreferences.findUnique({
    where: { employeeId },
  });
  if (!row) return null;
  // Cast to access ext fields that may exist post-migration but aren't in
  // Prisma client types until next prisma generate.
  const r = row as unknown as Record<string, unknown>;
  return {
    minShiftsPerWeek: row.minShiftsPerWeek,
    maxShiftsPerWeek: row.maxShiftsPerWeek,
    preferredShiftsPerWeek: row.preferredShiftsPerWeek,
    maxHoursPerWeek: row.maxHoursPerWeek,
    preferredHoursPerWeek: row.preferredHoursPerWeek,
    prefersMornings: row.prefersMornings,
    prefersEvenings: row.prefersEvenings,
    prefersWeekends: row.prefersWeekends,
    avoidBackToBackShifts: row.avoidBackToBackShifts,
    preferredShiftLength: (r['preferredShiftLength'] as number | null) ?? null,
    noWorkAfter: (r['noWorkAfter'] as string | null) ?? null,
    noWorkBefore: (r['noWorkBefore'] as string | null) ?? null,
    avoidWeekends: (r['avoidWeekends'] as boolean | undefined) ?? false,
    avoidNightShifts: (r['avoidNightShifts'] as boolean | undefined) ?? false,
    notes: (r['notes'] as string | null) ?? null,
  };
}

export async function upsertPreferences(
  orgId: string,
  employeeId: string,
  body: PreferencesPayload,
  db: Db = defaultPrisma,
): Promise<PreferencesPayload> {
  await assertEmployeeInOrg(db, employeeId, orgId);

  // Build a payload that only sets fields that exist as Prisma columns.
  // Extended fields (notes, avoidNightShifts, etc.) are written via raw SQL
  // so the build keeps working until `prisma generate` picks them up.
  const baseData = {
    minShiftsPerWeek: body.minShiftsPerWeek ?? null,
    maxShiftsPerWeek: body.maxShiftsPerWeek ?? null,
    preferredShiftsPerWeek: body.preferredShiftsPerWeek ?? null,
    maxHoursPerWeek: body.maxHoursPerWeek ?? null,
    preferredHoursPerWeek: body.preferredHoursPerWeek ?? null,
    prefersMornings: body.prefersMornings ?? false,
    prefersEvenings: body.prefersEvenings ?? false,
    prefersWeekends: body.prefersWeekends ?? false,
    avoidBackToBackShifts: body.avoidBackToBackShifts ?? false,
  };

  await db.employeePreferences.upsert({
    where: { employeeId },
    update: baseData,
    create: { employeeId, ...baseData },
  });

  // Extended fields via raw SQL — ignore failures so we don't break the
  // happy path if the migration hasn't been applied yet on this env.
  try {
    await db.$executeRawUnsafe(
      `UPDATE "employee_preferences"
         SET "preferredShiftLength" = $1,
             "noWorkAfter" = $2,
             "noWorkBefore" = $3,
             "avoidWeekends" = $4,
             "avoidNightShifts" = $5,
             "notes" = $6
       WHERE "employeeId" = $7::uuid`,
      body.preferredShiftLength ?? null,
      body.noWorkAfter ?? null,
      body.noWorkBefore ?? null,
      body.avoidWeekends ?? false,
      body.avoidNightShifts ?? false,
      body.notes ?? null,
      employeeId,
    );
  } catch {
    // swallow — extended columns may not exist yet
  }

  const out = await getPreferences(orgId, employeeId, db);
  return out ?? {};
}
