import { prisma as defaultPrisma } from '../../db/prisma.js';
import type { Db } from '../../db/prisma.js';
import { HttpError } from '../../shared/errors.js';

export interface LaborRules {
  maxHoursDay?: number;
  maxHoursWeek?: number;
  minRestHours?: number;
  shiftTypes?: string[];
  businessHoursStart?: string;
  businessHoursEnd?: string;
  roleRates?: Record<string, number>; // roleName → ILS per hour
}

export interface OrgSettings {
  id: string;
  name: string;
  industry: string | null;
  defaultTimezone: string;
  weekStartDay: number;
  plan: string;
  logoUrl: string | null;
  laborRules: LaborRules;
  roles: Array<{ id: string; name: string; description: string | null }>;
  locations: Array<{ id: string; name: string; timezone: string | null; address: string | null }>;
}

export async function getOrgSettings(orgId: string, db: Db = defaultPrisma): Promise<OrgSettings> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: {
      roles: { orderBy: { name: 'asc' } },
      locations: { orderBy: { name: 'asc' } },
    },
  });

  const laborRules: LaborRules =
    org.laborRulesJsonb && typeof org.laborRulesJsonb === 'object' && !Array.isArray(org.laborRulesJsonb)
      ? (org.laborRulesJsonb as LaborRules)
      : {};

  return {
    id: org.id,
    name: org.name,
    industry: org.industry ?? null,
    defaultTimezone: org.defaultTimezone,
    weekStartDay: org.weekStartDay,
    plan: org.plan,
    logoUrl: org.logoUrl ?? null,
    laborRules,
    roles: org.roles.map((r) => ({ id: r.id, name: r.name, description: r.description ?? null })),
    locations: org.locations.map((l) => ({
      id: l.id,
      name: l.name,
      timezone: l.timezone ?? null,
      address: (l as { address?: string }).address ?? null,
    })),
  };
}

export interface PatchOrgInput {
  name?: string;
  industry?: string;
  defaultTimezone?: string;
  weekStartDay?: number;
  logoUrl?: string | null;
  laborRules?: LaborRules;
}

export async function patchOrgSettings(
  orgId: string,
  input: PatchOrgInput,
  db: Db = defaultPrisma,
): Promise<OrgSettings> {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update['name'] = input.name;
  if (input.industry !== undefined) update['industry'] = input.industry;
  if (input.defaultTimezone !== undefined) update['defaultTimezone'] = input.defaultTimezone;
  if (input.weekStartDay !== undefined) update['weekStartDay'] = input.weekStartDay;
  if ('logoUrl' in input) update['logoUrl'] = input.logoUrl ?? null;
  if (input.laborRules !== undefined) {
    // Merge with existing rules instead of replace, so partial patches work.
    const existing = await db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { laborRulesJsonb: true },
    });
    const prev: LaborRules =
      existing.laborRulesJsonb && typeof existing.laborRulesJsonb === 'object'
        ? (existing.laborRulesJsonb as LaborRules)
        : {};
    update['laborRulesJsonb'] = { ...prev, ...input.laborRules };
  }

  await db.organization.update({ where: { id: orgId }, data: update });
  return getOrgSettings(orgId, db);
}

export async function updateRole(
  orgId: string,
  roleId: string,
  name: string,
  description: string | null | undefined,
  db: Db = defaultPrisma,
): Promise<{ id: string; name: string; description: string | null }> {
  const role = await db.role.findFirst({ where: { id: roleId, organizationId: orgId } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');

  const updated = await db.role.update({
    where: { id: roleId, organizationId: orgId },
    data: { name, ...(description !== undefined ? { description } : {}) },
  });
  return { id: updated.id, name: updated.name, description: updated.description ?? null };
}

export async function deleteRole(
  orgId: string,
  roleId: string,
  db: Db = defaultPrisma,
): Promise<void> {
  const role = await db.role.findFirst({ where: { id: roleId, organizationId: orgId } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');

  // Check if any employee is assigned this role before deleting.
  const employeeUsage = await db.employeeRole.count({ where: { roleId } });
  if (employeeUsage > 0)
    throw new HttpError(
      409,
      'ROLE_IN_USE',
      `לא ניתן למחוק תפקיד שמוגדר ל-${employeeUsage} עובד/ים`,
    );

  // Check if any active shift is using this role.
  const shiftUsage = await db.shift.count({ where: { roleId } });
  if (shiftUsage > 0)
    throw new HttpError(
      409,
      'ROLE_IN_USE',
      `לא ניתן למחוק תפקיד המשובץ ב-${shiftUsage} משמרת/ות`,
    );

  await db.role.delete({ where: { id: roleId, organizationId: orgId } });
}

export async function updateLocation(
  orgId: string,
  locationId: string,
  name: string,
  timezone: string | null | undefined,
  db: Db = defaultPrisma,
): Promise<{ id: string; name: string; timezone: string | null }> {
  const loc = await db.location.findFirst({
    where: { id: locationId, organizationId: orgId },
  });
  if (!loc) throw new HttpError(404, 'NOT_FOUND', 'Location not found');

  const updated = await db.location.update({
    where: { id: locationId, organizationId: orgId },
    data: {
      name,
      ...(timezone !== undefined
        ? { timezone: timezone === null ? undefined : timezone }
        : {}),
    },
  });
  return { id: updated.id, name: updated.name, timezone: updated.timezone ?? null };
}

export async function deleteLocation(
  orgId: string,
  locationId: string,
  db: Db = defaultPrisma,
): Promise<void> {
  const loc = await db.location.findFirst({
    where: { id: locationId, organizationId: orgId },
  });
  if (!loc) throw new HttpError(404, 'NOT_FOUND', 'Location not found');

  await db.location.delete({ where: { id: locationId, organizationId: orgId } });
}

// =========================================================
// Shift templates — owner/manager-defined named shifts with hours.
// Replaces the legacy `laborRules.shiftTypes` string array; lets
// managers define special shifts (e.g. "ארוחת צהריים 11:30→15:30").
// =========================================================

export interface ShiftTemplateInput {
  name: string;
  startLocalTime: string; // HH:MM
  endLocalTime: string;   // HH:MM
  requiredEmployeeCount?: number;
  locationId?: string | null;
  roleId?: string | null;
  timezone?: string;
}

export interface ShiftTemplateRow {
  id: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: number;
  crossesMidnight: boolean;
  locationId: string | null;
  roleId: string | null;
  timezone: string;
}

function toRow(t: {
  id: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: number;
  crossesMidnight: boolean;
  locationId: string | null;
  roleId: string | null;
  timezone: string;
}): ShiftTemplateRow {
  return {
    id: t.id,
    name: t.name,
    startLocalTime: t.startLocalTime,
    endLocalTime: t.endLocalTime,
    requiredEmployeeCount: t.requiredEmployeeCount,
    crossesMidnight: t.crossesMidnight,
    locationId: t.locationId,
    roleId: t.roleId,
    timezone: t.timezone,
  };
}

/** End-time strictly less-than-or-equal to start ⇒ shift wraps past midnight. */
function computeCrossesMidnight(start: string, end: string): boolean {
  return end <= start;
}

export async function listShiftTemplates(
  orgId: string,
  db: Db = defaultPrisma,
): Promise<ShiftTemplateRow[]> {
  const rows = await db.shiftTemplate.findMany({
    where: { organizationId: orgId },
    orderBy: [{ startLocalTime: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toRow);
}

export async function createShiftTemplate(
  orgId: string,
  input: ShiftTemplateInput,
  defaultTimezone: string,
  db: Db = defaultPrisma,
): Promise<ShiftTemplateRow> {
  const created = await db.shiftTemplate.create({
    data: {
      organizationId: orgId,
      name: input.name.trim(),
      startLocalTime: input.startLocalTime,
      endLocalTime: input.endLocalTime,
      timezone: input.timezone ?? defaultTimezone,
      crossesMidnight: computeCrossesMidnight(input.startLocalTime, input.endLocalTime),
      requiredEmployeeCount: input.requiredEmployeeCount ?? 1,
      locationId: input.locationId ?? null,
      roleId: input.roleId ?? null,
    },
  });
  return toRow(created);
}

export async function updateShiftTemplate(
  orgId: string,
  templateId: string,
  input: Partial<ShiftTemplateInput>,
  db: Db = defaultPrisma,
): Promise<ShiftTemplateRow> {
  const existing = await db.shiftTemplate.findFirst({
    where: { id: templateId, organizationId: orgId },
  });
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Shift template not found');

  const newStart = input.startLocalTime ?? existing.startLocalTime;
  const newEnd = input.endLocalTime ?? existing.endLocalTime;

  const updated = await db.shiftTemplate.update({
    where: { id: templateId, organizationId: orgId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.startLocalTime !== undefined ? { startLocalTime: input.startLocalTime } : {}),
      ...(input.endLocalTime !== undefined ? { endLocalTime: input.endLocalTime } : {}),
      ...(input.startLocalTime !== undefined || input.endLocalTime !== undefined
        ? { crossesMidnight: computeCrossesMidnight(newStart, newEnd) }
        : {}),
      ...(input.requiredEmployeeCount !== undefined
        ? { requiredEmployeeCount: input.requiredEmployeeCount }
        : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId ?? null } : {}),
      ...(input.roleId !== undefined ? { roleId: input.roleId ?? null } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    },
  });
  return toRow(updated);
}

export async function deleteShiftTemplate(
  orgId: string,
  templateId: string,
  db: Db = defaultPrisma,
): Promise<void> {
  const existing = await db.shiftTemplate.findFirst({
    where: { id: templateId, organizationId: orgId },
  });
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Shift template not found');

  await db.shiftTemplate.delete({ where: { id: templateId, organizationId: orgId } });
}
