import type { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';

/**
 * Auto-generate a week's shift skeleton from the org's OPERATING HOURS — no
 * template, no manual setup. The business already declares, in laborRulesJsonb:
 *   - businessHoursStart / businessHoursEnd  ("HH:mm")
 *   - which days it is open: either `activeDaysOfWeek: number[]` or
 *     `dailyStandards: { "0".."6": hours }` (a day with > 0 hours is open)
 * We lay one coverage shift per open day across the business window, splitting
 * it into two when the window is longer than the daily max so a single person
 * isn't expected to cover a 15-hour day.
 *
 * Idempotent: skipped when the target week already has shifts.
 */
export interface GenerateFromHoursResult {
  shiftsCreated: number;
  openDays: number[];
  message?: string;
}

const DEFAULT_TZ = 'Asia/Jerusalem';

interface ParsedHours {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  openDays: number[]; // 0..6
  maxHoursDay: number;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Pull operating-hours intent out of an org's (merged) labor-rules jsonb. */
export function parseOperatingHours(
  orgRules: unknown,
  locationRules?: unknown,
): ParsedHours | null {
  const merged = { ...asRecord(orgRules), ...asRecord(locationRules) };

  const start = typeof merged['businessHoursStart'] === 'string' ? (merged['businessHoursStart'] as string) : null;
  const end = typeof merged['businessHoursEnd'] === 'string' ? (merged['businessHoursEnd'] as string) : null;
  if (!start || !end) return null;

  let openDays: number[] = [];
  const active = merged['activeDaysOfWeek'];
  if (Array.isArray(active)) {
    openDays = active.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6);
  } else {
    const daily = asRecord(merged['dailyStandards']);
    if (Object.keys(daily).length > 0) {
      for (let d = 0; d <= 6; d++) {
        const h = Number(daily[String(d)]);
        if (Number.isFinite(h) && h > 0) openDays.push(d);
      }
    }
  }
  // Fallback: Sun–Thu if open days couldn't be determined.
  if (openDays.length === 0) openDays = [0, 1, 2, 3, 4];

  const maxHoursDay = Number(merged['maxHoursDay']);
  return {
    start,
    end,
    openDays,
    maxHoursDay: Number.isFinite(maxHoursDay) && maxHoursDay > 0 ? maxHoursDay : 9,
  };
}

function hhmm(t: string): { h: number; m: number } {
  const [h = '0', m = '0'] = t.split(':');
  return { h: Number(h), m: Number(m) };
}

/**
 * Split [start,end] (in hours from midnight, end may be > 24 for overnight)
 * into 1 or 2 windows so no window exceeds maxHoursDay.
 */
function windowsFor(startH: number, endH: number, maxHoursDay: number): Array<[number, number]> {
  const total = endH - startH;
  if (total <= maxHoursDay) return [[startH, endH]];
  const mid = startH + total / 2;
  return [
    [startH, mid],
    [mid, endH],
  ];
}

export async function generateShiftsFromOperatingHours(
  args: { scheduleId: string; organizationId: string },
  db: Db = defaultPrisma,
): Promise<GenerateFromHoursResult> {
  const { scheduleId, organizationId } = args;

  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, organizationId },
    select: {
      id: true,
      periodStartDate: true,
      timezone: true,
      locationId: true,
      organization: { select: { laborRulesJsonb: true } },
      location: { select: { laborRulesJsonb: true } },
    },
  });
  if (!schedule) {
    throw Object.assign(new Error('Schedule not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const parsed = parseOperatingHours(
    schedule.organization.laborRulesJsonb,
    schedule.location?.laborRulesJsonb,
  );
  if (!parsed) {
    return { shiftsCreated: 0, openDays: [], message: 'no_business_hours' };
  }

  const existing = await db.shift.count({
    where: { organizationId, scheduleId, status: { not: 'CANCELLED' } },
  });
  if (existing > 0) {
    return { shiftsCreated: 0, openDays: parsed.openDays, message: 'week_already_has_shifts' };
  }

  const tz = schedule.timezone || DEFAULT_TZ;
  const weekStart = DateTime.fromJSDate(schedule.periodStartDate, { zone: 'utc' });

  const { h: sH, m: sM } = hhmm(parsed.start);
  let { h: eH } = hhmm(parsed.end);
  const { m: eM } = hhmm(parsed.end);
  const startHours = sH + sM / 60;
  let endHours = eH + eM / 60;
  if (endHours <= startHours) endHours += 24; // closes after midnight

  let shiftsCreated = 0;
  for (const day of parsed.openDays) {
    const dayStr = weekStart.plus({ days: day }).toFormat('yyyy-MM-dd');
    for (const [wStart, wEnd] of windowsFor(startHours, endHours, parsed.maxHoursDay)) {
      const start = DateTime.fromISO(`${dayStr}T00:00`, { zone: tz }).plus({ hours: wStart });
      const end = DateTime.fromISO(`${dayStr}T00:00`, { zone: tz }).plus({ hours: wEnd });
      await db.shift.create({
        data: {
          organizationId,
          scheduleId,
          locationId: schedule.locationId,
          startAtUtc: start.toUTC().toJSDate(),
          endAtUtc: end.toUTC().toJSDate(),
          timezone: tz,
          localStartDate: new Date(`${dayStr}T00:00:00Z`),
          localEndDate: new Date(`${end.toFormat('yyyy-MM-dd')}T00:00:00Z`),
          status: 'PLANNED',
          requiredEmployeeCount: 1,
        },
      });
      shiftsCreated++;
    }
  }

  return { shiftsCreated, openDays: parsed.openDays };
}

export interface GenerateFromTemplatesResult {
  shiftsCreated: number;
  templatesUsed: number;
  openDays: number[];
  message?: string;
}

/**
 * Generate the week's shifts from the org's defined ShiftTemplate rows
 * (e.g. בוקר / צהריים / ערב, each with its own role + requiredEmployeeCount).
 * For every open day we create one Shift per template, preserving roleId and
 * requiredEmployeeCount — so the auto-scheduler fills the EXACT structure the
 * manager designed (and role-match keeps a manager template manager-only).
 *
 * Idempotent: skipped when the week already has shifts.
 */
export async function generateShiftsFromShiftTemplates(
  args: { scheduleId: string; organizationId: string },
  db: Db = defaultPrisma,
): Promise<GenerateFromTemplatesResult> {
  const { scheduleId, organizationId } = args;

  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, organizationId },
    select: {
      id: true,
      periodStartDate: true,
      timezone: true,
      locationId: true,
      organization: { select: { laborRulesJsonb: true } },
      location: { select: { laborRulesJsonb: true } },
    },
  });
  if (!schedule) {
    throw Object.assign(new Error('Schedule not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const templates = await db.shiftTemplate.findMany({
    where: { organizationId, ...(schedule.locationId ? { OR: [{ locationId: schedule.locationId }, { locationId: null }] } : {}) },
    orderBy: { startLocalTime: 'asc' },
  });
  if (templates.length === 0) {
    return { shiftsCreated: 0, templatesUsed: 0, openDays: [], message: 'no_templates' };
  }

  const existing = await db.shift.count({
    where: { organizationId, scheduleId, status: { not: 'CANCELLED' } },
  });
  if (existing > 0) {
    return { shiftsCreated: 0, templatesUsed: templates.length, openDays: [], message: 'week_already_has_shifts' };
  }

  // Open days: prefer the org's declared business days; else Sun–Thu.
  const parsed = parseOperatingHours(schedule.organization.laborRulesJsonb, schedule.location?.laborRulesJsonb);
  const openDays = parsed?.openDays ?? [0, 1, 2, 3, 4];

  const tz = schedule.timezone || DEFAULT_TZ;
  const weekStart = DateTime.fromJSDate(schedule.periodStartDate, { zone: 'utc' });

  let shiftsCreated = 0;
  for (const day of openDays) {
    const dayStr = weekStart.plus({ days: day }).toFormat('yyyy-MM-dd');
    for (const t of templates) {
      const ttz = t.timezone || tz;
      const { h: sH, m: sM } = hhmm(t.startLocalTime);
      const { h: eH, m: eM } = hhmm(t.endLocalTime);
      const start = DateTime.fromISO(`${dayStr}T00:00`, { zone: ttz }).plus({ hours: sH, minutes: sM });
      let end = DateTime.fromISO(`${dayStr}T00:00`, { zone: ttz }).plus({ hours: eH, minutes: eM });
      if (end <= start) end = end.plus({ days: 1 }); // crosses midnight

      await db.shift.create({
        data: {
          organizationId,
          scheduleId,
          locationId: t.locationId ?? schedule.locationId,
          roleId: t.roleId,
          templateId: t.id,
          startAtUtc: start.toUTC().toJSDate(),
          endAtUtc: end.toUTC().toJSDate(),
          timezone: ttz,
          localStartDate: new Date(`${dayStr}T00:00:00Z`),
          localEndDate: new Date(`${end.toFormat('yyyy-MM-dd')}T00:00:00Z`),
          status: 'PLANNED',
          requiredEmployeeCount: t.requiredEmployeeCount,
        },
      });
      shiftsCreated++;
    }
  }

  return { shiftsCreated, templatesUsed: templates.length, openDays };
}
