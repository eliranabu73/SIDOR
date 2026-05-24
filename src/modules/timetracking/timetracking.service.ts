/**
 * Time-tracking service — שעון נוכחות
 *
 * All times are stored as UTC instants in the DB. The service layer never
 * converts to local time; that is the frontend's job.
 *
 * Error handling convention: thrown errors carry a `statusCode` property so
 * the Fastify error handler maps them to the correct HTTP status (409, 404…).
 */

import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClockInInput {
  organizationId: string;
  employeeId: string;
  shiftAssignmentId?: string;
  lat?: number;
  lng?: number;
  note?: string;
}

export interface ClockOutInput {
  organizationId: string;
  employeeId: string;
  lat?: number;
  lng?: number;
}

export interface ListEntriesInput {
  organizationId: string;
  employeeId?: string;
  from: Date;
  to: Date;
}

export interface PatchEntryInput {
  id: string;
  organizationId: string;
  clockInAt?: Date;
  clockOutAt?: Date | null;
  note?: string;
}

// ---------------------------------------------------------------------------
// Clock in
// ---------------------------------------------------------------------------

/**
 * Clock in an employee. Throws 409 if the employee already has an open entry
 * (clockOutAt IS NULL) in this organisation.
 */
export async function clockIn(input: ClockInInput, db: Db = defaultPrisma) {
  // Guard: at most one open entry per employee per org.
  const open = await db.timeEntry.findFirst({
    where: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      clockOutAt: null,
    },
  });
  if (open) {
    throw Object.assign(
      new Error('יש כניסה פתוחה — יש לצאת קודם'),
      { statusCode: 409, code: 'ALREADY_CLOCKED_IN' },
    );
  }

  return db.timeEntry.create({
    data: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      shiftAssignmentId: input.shiftAssignmentId ?? null,
      clockInAt: new Date(),
      clockInLat: input.lat ?? null,
      clockInLng: input.lng ?? null,
      note: input.note ?? null,
      source: 'employee',
    },
  });
}

// ---------------------------------------------------------------------------
// Clock out
// ---------------------------------------------------------------------------

/**
 * Clock out an employee. Throws 409 if there is no open entry.
 */
export async function clockOut(input: ClockOutInput, db: Db = defaultPrisma) {
  const open = await db.timeEntry.findFirst({
    where: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      clockOutAt: null,
    },
  });
  if (!open) {
    throw Object.assign(
      new Error('אין כניסה פתוחה'),
      { statusCode: 409, code: 'NOT_CLOCKED_IN' },
    );
  }

  return db.timeEntry.update({
    where: { id: open.id },
    data: {
      clockOutAt: new Date(),
      clockOutLat: input.lat ?? null,
      clockOutLng: input.lng ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Return the current open entry for an employee, or null if clocked out.
 */
export async function getOpenEntry(
  orgId: string,
  employeeId: string,
  db: Db = defaultPrisma,
) {
  return db.timeEntry.findFirst({
    where: { organizationId: orgId, employeeId, clockOutAt: null },
  });
}

// ---------------------------------------------------------------------------
// List entries (manager / payroll view)
// ---------------------------------------------------------------------------

/**
 * List completed and open entries for a period.
 * Pass `employeeId` to narrow to a single employee.
 */
export async function listEntries(input: ListEntriesInput, db: Db = defaultPrisma) {
  return db.timeEntry.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      clockInAt: { gte: input.from, lt: input.to },
    },
    include: {
      employee: { select: { id: true, fullName: true } },
    },
    orderBy: { clockInAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Manager edit (correction)
// ---------------------------------------------------------------------------

/**
 * Patch an existing entry to correct clock times. Sets source to
 * 'manager_edit' so audits can distinguish corrections from original punches.
 * Throws 404 if the entry doesn't exist in the given org.
 */
export async function patchEntry(input: PatchEntryInput, db: Db = defaultPrisma) {
  const entry = await db.timeEntry.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!entry) {
    throw Object.assign(new Error('רשומה לא נמצאה'), { statusCode: 404 });
  }

  // Validate: clockInAt must be before clockOutAt when both are provided.
  const newIn = input.clockInAt ?? entry.clockInAt;
  const newOut = input.clockOutAt !== undefined ? input.clockOutAt : entry.clockOutAt;
  if (newOut !== null && newOut !== undefined && newIn >= newOut) {
    throw Object.assign(
      new Error('שעת כניסה חייבת להיות לפני שעת יציאה'),
      { statusCode: 422, code: 'INVALID_TIME_RANGE' },
    );
  }

  return db.timeEntry.update({
    where: { id: input.id },
    data: {
      ...(input.clockInAt !== undefined ? { clockInAt: input.clockInAt } : {}),
      ...(input.clockOutAt !== undefined ? { clockOutAt: input.clockOutAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      source: 'manager_edit',
    },
  });
}

// ---------------------------------------------------------------------------
// Compute actual worked minutes (pure function — no DB call)
// ---------------------------------------------------------------------------

/**
 * Sum up total worked minutes from a list of completed time entries.
 * Open entries (clockOutAt = null) are skipped; they haven't ended yet.
 *
 * @param entries - Array of time entries (can include open ones; they are ignored).
 * @returns Total minutes worked, rounded to the nearest minute.
 */
export function computeActualMinutes(
  entries: Array<{ clockInAt: Date; clockOutAt: Date | null }>,
): number {
  return entries.reduce((sum, e) => {
    if (!e.clockOutAt) return sum; // open entry — don't count yet
    return sum + Math.round((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60_000);
  }, 0);
}
