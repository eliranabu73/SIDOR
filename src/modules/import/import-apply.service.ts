/**
 * Import-apply service — turns the user-confirmed ParsedSchedule into
 * Employee + Role + Shift rows in the user's org.
 *
 * Role + Location are upserted by name (case-insensitive within the org).
 * Employees are inserted in bulk (skipDuplicates on fullName) — if a name
 * already exists we leave the existing row alone.
 * Shifts are computed against weekStart (defaults to current Sunday-start
 * week) using the org's default timezone. Times are interpreted as local
 * Israel time and converted to UTC by treating the wall-clock as Asia/Jerusalem
 * via a fixed +02:00 / +03:00 lookup. For MVP we assume Asia/Jerusalem.
 */
import { prisma as defaultPrisma } from '../../db/prisma.js';
import type { Db } from '../../db/prisma.js';
import { ValidationFailedError } from '../../shared/errors.js';

export interface ApplyEmployee {
  fullName: string;
  phone?: string;
  role?: string;
  skip?: boolean;
}

export interface ApplyShift {
  dayOfWeek: number | string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  role?: string;
  employees?: string[];
  skip?: boolean;
}

export interface ApplyImportInput {
  orgId: string;
  userId: string;
  weekStart?: string; // YYYY-MM-DD — if absent we derive current Sunday
  scheduleId?: string;
  employees: ApplyEmployee[];
  shifts: ApplyShift[];
  defaultLocationId?: string;
}

export interface ApplyImportResult {
  scheduleId: string;
  createdEmployees: number;
  createdShifts: number;
  createdRoles: number;
  skippedShifts: number;
}

/** Sunday-start of the week containing `d` (UTC date-only). */
function sundayOf(d: Date): Date {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  u.setUTCDate(u.getUTCDate() - u.getUTCDay());
  return u;
}

function parseHHmm(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

/**
 * Israel timezone offset in minutes for a given UTC date (DST-aware enough
 * for MVP). IST = UTC+2, IDT = UTC+3 (last Friday of March 02:00 IST →
 * last Sunday of October 02:00 IDT). We approximate: DST is in effect
 * from last Friday of March to last Sunday of October.
 */
function israelOffsetMinutes(utc: Date): number {
  const y = utc.getUTCFullYear();
  // last Friday of March
  const marEnd = new Date(Date.UTC(y, 2, 31));
  const marLastFri = new Date(marEnd);
  marLastFri.setUTCDate(31 - ((marEnd.getUTCDay() - 5 + 7) % 7));
  // last Sunday of October
  const octEnd = new Date(Date.UTC(y, 9, 31));
  const octLastSun = new Date(octEnd);
  octLastSun.setUTCDate(31 - octEnd.getUTCDay());
  const inDst = utc >= marLastFri && utc < octLastSun;
  return inDst ? 180 : 120;
}

/** Combine a wall-clock local date + HH:mm in Israel TZ → UTC instant. */
function localIsraelToUtc(dateUtcMidnight: Date, hh: number, mm: number): Date {
  // First guess: treat the wall-clock as UTC, then subtract IL offset.
  const guess = new Date(dateUtcMidnight);
  guess.setUTCHours(hh, mm, 0, 0);
  const off = israelOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60_000);
}

async function upsertRoleByName(
  orgId: string,
  name: string,
  db: Db,
): Promise<{ id: string; created: boolean }> {
  const trimmed = name.trim();
  const existing = await db.role.findFirst({
    where: { organizationId: orgId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const created = await db.role.create({
    data: { organizationId: orgId, name: trimmed },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

export async function applyImport(
  input: ApplyImportInput,
  db: Db = defaultPrisma,
): Promise<ApplyImportResult> {
  // Resolve weekStart
  const weekStart = input.weekStart
    ? new Date(`${input.weekStart}T00:00:00Z`)
    : sundayOf(new Date());
  if (Number.isNaN(weekStart.getTime())) {
    throw new ValidationFailedError('INVALID_WEEK_START', 'weekStart must be YYYY-MM-DD');
  }

  // Default location: first active location for org.
  let locationId = input.defaultLocationId;
  if (!locationId) {
    const loc = await db.location.findFirst({
      where: { organizationId: input.orgId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!loc) {
      throw new ValidationFailedError(
        'NO_LOCATION',
        'Organization has no active location; create one before importing',
      );
    }
    locationId = loc.id;
  }

  // Determine / create target schedule.
  let scheduleId = input.scheduleId;
  if (scheduleId) {
    const ok = await db.schedule.findFirst({
      where: { id: scheduleId, organizationId: input.orgId },
      select: { id: true },
    });
    if (!ok) {
      throw new ValidationFailedError('SCHEDULE_NOT_FOUND', 'scheduleId not found in org');
    }
  } else {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    const sch = await db.schedule.create({
      data: {
        organizationId: input.orgId,
        locationId,
        name: `יבוא ${weekStart.toISOString().slice(0, 10)}`,
        periodStartDate: weekStart,
        periodEndDate: weekEnd,
        timezone: 'Asia/Jerusalem',
        status: 'DRAFT',
        createdByUserId: input.userId,
      },
      select: { id: true },
    });
    scheduleId = sch.id;
  }

  // 1) Roles — collect from employees + shifts.
  const roleNames = new Set<string>();
  for (const e of input.employees) {
    if (e.skip) continue;
    if (e.role && e.role.trim()) roleNames.add(e.role.trim());
  }
  for (const s of input.shifts) {
    if (s.skip) continue;
    if (s.role && s.role.trim()) roleNames.add(s.role.trim());
  }
  if (roleNames.size === 0) roleNames.add('כללי'); // fallback role

  const roleIdByName = new Map<string, string>();
  let createdRoles = 0;
  for (const name of roleNames) {
    const r = await upsertRoleByName(input.orgId, name, db);
    roleIdByName.set(name.toLowerCase(), r.id);
    if (r.created) createdRoles += 1;
  }

  // 2) Employees — bulk insert, skipping those that exist (by fullName).
  const wantedEmployees = input.employees.filter((e) => !e.skip && e.fullName.trim());
  const existingEmployees = await db.employee.findMany({
    where: {
      organizationId: input.orgId,
      fullName: { in: wantedEmployees.map((e) => e.fullName.trim()) },
    },
    select: { id: true, fullName: true },
  });
  const empIdByName = new Map<string, string>();
  for (const e of existingEmployees) empIdByName.set(e.fullName, e.id);

  let createdEmployees = 0;
  for (const e of wantedEmployees) {
    const name = e.fullName.trim();
    if (empIdByName.has(name)) continue;
    const roleId =
      e.role && roleIdByName.get(e.role.trim().toLowerCase());
    const created = await db.employee.create({
      data: {
        organizationId: input.orgId,
        fullName: name,
        phone: e.phone?.trim() || null,
        employmentType: 'FULL_TIME',
        defaultLocationId: locationId,
        roles: roleId ? { create: [{ roleId }] } : undefined,
      },
      select: { id: true },
    });
    empIdByName.set(name, created.id);
    createdEmployees += 1;
  }

  // 3) Shifts.
  let createdShifts = 0;
  let skippedShifts = 0;

  for (const s of input.shifts) {
    if (s.skip) {
      skippedShifts += 1;
      continue;
    }
    const start = parseHHmm(s.startTime);
    const end = parseHHmm(s.endTime);
    if (!start || !end) {
      skippedShifts += 1;
      continue;
    }

    // Resolve shift date.
    let shiftDate: Date;
    if (typeof s.dayOfWeek === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.dayOfWeek)) {
      shiftDate = new Date(`${s.dayOfWeek}T00:00:00Z`);
    } else {
      const dow = Number(s.dayOfWeek);
      if (!Number.isFinite(dow) || dow < 0 || dow > 6) {
        skippedShifts += 1;
        continue;
      }
      shiftDate = new Date(weekStart);
      shiftDate.setUTCDate(weekStart.getUTCDate() + dow);
    }

    const startAtUtc = localIsraelToUtc(shiftDate, start.h, start.m);
    let endAtUtc = localIsraelToUtc(shiftDate, end.h, end.m);
    // Crosses midnight: bump end to next day.
    if (endAtUtc.getTime() <= startAtUtc.getTime()) {
      endAtUtc = new Date(endAtUtc.getTime() + 24 * 60 * 60_000);
    }

    // Resolve role (prefer shift.role, else first employee's role, else fallback).
    let roleId =
      (s.role && roleIdByName.get(s.role.trim().toLowerCase())) || undefined;
    if (!roleId) {
      // try the first assigned employee's role
      const empName = s.employees?.[0];
      if (empName) {
        const empRow = input.employees.find((e) => e.fullName === empName);
        if (empRow?.role) {
          roleId = roleIdByName.get(empRow.role.trim().toLowerCase());
        }
      }
    }
    if (!roleId) {
      // fallback: first available role
      const firstKey = roleIdByName.keys().next().value;
      if (firstKey) roleId = roleIdByName.get(firstKey);
    }
    if (!roleId) {
      skippedShifts += 1;
      continue;
    }

    const created = await db.shift.create({
      data: {
        organizationId: input.orgId,
        scheduleId,
        locationId,
        roleId,
        startAtUtc,
        endAtUtc,
        timezone: 'Asia/Jerusalem',
        localStartDate: new Date(
          Date.UTC(
            shiftDate.getUTCFullYear(),
            shiftDate.getUTCMonth(),
            shiftDate.getUTCDate(),
          ),
        ),
        localEndDate: new Date(
          Date.UTC(
            endAtUtc.getUTCFullYear(),
            endAtUtc.getUTCMonth(),
            endAtUtc.getUTCDate(),
          ),
        ),
        requiredEmployeeCount: Math.max(1, s.employees?.length ?? 1),
        status: 'PLANNED',
        version: 1,
      },
      select: { id: true },
    });
    createdShifts += 1;

    // Best-effort: pre-assign employees if names match.
    if (s.employees && s.employees.length > 0) {
      for (const name of s.employees) {
        const empId = empIdByName.get(name);
        if (!empId) continue;
        try {
          await db.shiftAssignment.create({
            data: {
              shiftId: created.id,
              employeeId: empId,
              assignmentStatus: 'CONFIRMED',
              source: 'MANUAL',
            },
          });
        } catch {
          // unique-conflict or schema mismatch — ignore for MVP
        }
      }
    }
  }

  return {
    scheduleId,
    createdEmployees,
    createdShifts,
    createdRoles,
    skippedShifts,
  };
}
