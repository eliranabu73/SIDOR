import type { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';

export interface WeeklyTemplateShiftInput {
  dayOfWeek: number; // 0..6
  startLocalTime: string; // "HH:mm" | "HH:mm:ss"
  endLocalTime: string;
  timezone?: string;
  roleId?: string | null;
  requiredEmployeeCount?: number;
  defaultEmployeeIds?: string[];
}

export interface UpsertWeeklyTemplateInput {
  name: string;
  locationId?: string | null;
  shifts: WeeklyTemplateShiftInput[];
}

const DEFAULT_TZ = 'Asia/Jerusalem';

function normalizeTime(t: string): string {
  // Accept "HH:mm" or "HH:mm:ss" → return "HH:mm" for Luxon ISO building.
  const [hh = '00', mm = '00'] = t.split(':');
  return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
}

/** List templates (with their shifts) for an org. */
export async function listWeeklyTemplates(organizationId: string, db: Db = defaultPrisma) {
  return db.weeklyTemplate.findMany({
    where: { organizationId },
    include: { shifts: { orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }] } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getWeeklyTemplate(
  organizationId: string,
  templateId: string,
  db: Db = defaultPrisma,
) {
  return db.weeklyTemplate.findFirst({
    where: { id: templateId, organizationId },
    include: { shifts: { orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }] } },
  });
}

/** Create a template plus its shift rows in one transaction. */
export async function createWeeklyTemplate(
  organizationId: string,
  input: UpsertWeeklyTemplateInput,
  db: Db = defaultPrisma,
) {
  return db.weeklyTemplate.create({
    data: {
      organizationId,
      locationId: input.locationId ?? null,
      name: input.name,
      shifts: {
        create: input.shifts.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startLocalTime: s.startLocalTime,
          endLocalTime: s.endLocalTime,
          timezone: s.timezone ?? DEFAULT_TZ,
          roleId: s.roleId ?? null,
          requiredEmployeeCount: s.requiredEmployeeCount ?? 1,
          defaultEmployeeIds: s.defaultEmployeeIds ?? [],
        })),
      },
    },
    include: { shifts: true },
  });
}

/** Replace a template's name/location and its full shift set (delete + recreate). */
export async function updateWeeklyTemplate(
  organizationId: string,
  templateId: string,
  input: UpsertWeeklyTemplateInput,
  db: Db = defaultPrisma,
) {
  const existing = await db.weeklyTemplate.findFirst({
    where: { id: templateId, organizationId },
    select: { id: true },
  });
  if (!existing) return null;

  await db.weeklyTemplateShift.deleteMany({ where: { weeklyTemplateId: templateId } });
  return db.weeklyTemplate.update({
    where: { id: templateId },
    data: {
      name: input.name,
      locationId: input.locationId ?? null,
      shifts: {
        create: input.shifts.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startLocalTime: s.startLocalTime,
          endLocalTime: s.endLocalTime,
          timezone: s.timezone ?? DEFAULT_TZ,
          roleId: s.roleId ?? null,
          requiredEmployeeCount: s.requiredEmployeeCount ?? 1,
          defaultEmployeeIds: s.defaultEmployeeIds ?? [],
        })),
      },
    },
    include: { shifts: true },
  });
}

export async function deleteWeeklyTemplate(
  organizationId: string,
  templateId: string,
  db: Db = defaultPrisma,
) {
  const existing = await db.weeklyTemplate.findFirst({
    where: { id: templateId, organizationId },
    select: { id: true },
  });
  if (!existing) return false;
  await db.weeklyTemplate.delete({ where: { id: templateId } });
  return true;
}

export interface ApplyTemplateResult {
  shiftsCreated: number;
  assignmentsCreated: number;
  message?: string;
}

/**
 * Materialise a WeeklyTemplate into a concrete schedule's week. For each
 * template shift we create a Shift on the matching day of the schedule's week
 * and seed its default employees as CONFIRMED assignments (source IMPORT).
 *
 * Like copy-from-previous-week, this intentionally skips the rules validator —
 * it is a fast starting point; conflicts surface on the next compliance pass /
 * auto-schedule. Skipped if the target week already has shifts (no duplicates).
 */
export async function applyTemplateToSchedule(
  args: { scheduleId: string; templateId: string; organizationId: string; actingUserId?: string | null },
  db: Db = defaultPrisma,
): Promise<ApplyTemplateResult> {
  const { scheduleId, templateId, organizationId, actingUserId } = args;

  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, organizationId },
    select: { id: true, periodStartDate: true, locationId: true, timezone: true },
  });
  if (!schedule) {
    throw Object.assign(new Error('Schedule not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const template = await db.weeklyTemplate.findFirst({
    where: { id: templateId, organizationId },
    include: { shifts: true },
  });
  if (!template) {
    throw Object.assign(new Error('Template not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  if (template.shifts.length === 0) {
    return { shiftsCreated: 0, assignmentsCreated: 0, message: 'template_has_no_shifts' };
  }

  const existing = await db.shift.count({
    where: { organizationId, scheduleId, status: { not: 'CANCELLED' } },
  });
  if (existing > 0) {
    return { shiftsCreated: 0, assignmentsCreated: 0, message: 'week_already_has_shifts' };
  }

  // periodStartDate is stored as a @db.Date — treat as the week's Sunday.
  const weekStart = DateTime.fromJSDate(schedule.periodStartDate, { zone: 'utc' });

  let shiftsCreated = 0;
  let assignmentsCreated = 0;

  for (const ts of template.shifts) {
    const tz = ts.timezone || schedule.timezone || DEFAULT_TZ;
    const dayDate = weekStart.plus({ days: ts.dayOfWeek }); // calendar day (UTC anchor)
    const dateStr = dayDate.toFormat('yyyy-MM-dd');

    const start = DateTime.fromISO(`${dateStr}T${normalizeTime(ts.startLocalTime)}`, { zone: tz });
    let end = DateTime.fromISO(`${dateStr}T${normalizeTime(ts.endLocalTime)}`, { zone: tz });
    // Overnight shift: end-of-day rolls into the next calendar day.
    if (end <= start) end = end.plus({ days: 1 });

    const created = await db.shift.create({
      data: {
        organizationId,
        scheduleId,
        locationId: template.locationId ?? schedule.locationId,
        roleId: ts.roleId,
        startAtUtc: start.toUTC().toJSDate(),
        endAtUtc: end.toUTC().toJSDate(),
        timezone: tz,
        localStartDate: new Date(`${dateStr}T00:00:00Z`),
        localEndDate: new Date(`${end.toFormat('yyyy-MM-dd')}T00:00:00Z`),
        status: 'PLANNED',
        requiredEmployeeCount: ts.requiredEmployeeCount,
      },
      select: { id: true },
    });
    shiftsCreated++;

    const empIds = (ts.defaultEmployeeIds ?? []).filter(Boolean);
    if (empIds.length > 0) {
      // Only seed employees that still exist & are active in this org.
      const valid = await db.employee.findMany({
        where: { id: { in: empIds }, organizationId, isActive: true },
        select: { id: true },
      });
      if (valid.length > 0) {
        const res = await (db as PrismaClient).shiftAssignment.createMany({
          data: valid.map((e) => ({
            shiftId: created.id,
            employeeId: e.id,
            assignmentStatus: 'CONFIRMED' as const,
            source: 'IMPORT' as const,
            assignedByUserId: actingUserId ?? null,
          })),
          skipDuplicates: true,
        });
        assignmentsCreated += res.count;
      }
    }
  }

  return { shiftsCreated, assignmentsCreated };
}
