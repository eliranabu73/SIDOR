import { prisma } from '../../db/prisma.js';
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
  laborRules: LaborRules;
  roles: Array<{ id: string; name: string; description: string | null }>;
  locations: Array<{ id: string; name: string; timezone: string | null; address: string | null }>;
}

export async function getOrgSettings(orgId: string): Promise<OrgSettings> {
  const org = await prisma.organization.findUniqueOrThrow({
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
  laborRules?: LaborRules;
}

export async function patchOrgSettings(orgId: string, input: PatchOrgInput): Promise<OrgSettings> {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update['name'] = input.name;
  if (input.industry !== undefined) update['industry'] = input.industry;
  if (input.defaultTimezone !== undefined) update['defaultTimezone'] = input.defaultTimezone;
  if (input.weekStartDay !== undefined) update['weekStartDay'] = input.weekStartDay;
  if (input.laborRules !== undefined) {
    // Merge with existing rules instead of replace, so partial patches work.
    const existing = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { laborRulesJsonb: true },
    });
    const prev: LaborRules =
      existing.laborRulesJsonb && typeof existing.laborRulesJsonb === 'object'
        ? (existing.laborRulesJsonb as LaborRules)
        : {};
    update['laborRulesJsonb'] = { ...prev, ...input.laborRules };
  }

  await prisma.organization.update({ where: { id: orgId }, data: update });
  return getOrgSettings(orgId);
}

export async function updateRole(
  orgId: string,
  roleId: string,
  name: string,
  description?: string | null,
): Promise<{ id: string; name: string; description: string | null }> {
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId: orgId } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');

  const updated = await prisma.role.update({
    where: { id: roleId },
    data: { name, ...(description !== undefined ? { description } : {}) },
  });
  return { id: updated.id, name: updated.name, description: updated.description ?? null };
}

export async function deleteRole(orgId: string, roleId: string): Promise<void> {
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId: orgId } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');

  // Check if any employee is assigned this role before deleting.
  const usage = await prisma.employeeRole.count({ where: { roleId } });
  if (usage > 0)
    throw new HttpError(
      409,
      'ROLE_IN_USE',
      `לא ניתן למחוק תפקיד שמוגדר ל-${usage} עובד/ים`,
    );

  await prisma.role.delete({ where: { id: roleId } });
}

export async function updateLocation(
  orgId: string,
  locationId: string,
  name: string,
  timezone?: string | null,
): Promise<{ id: string; name: string; timezone: string | null }> {
  const loc = await prisma.location.findFirst({
    where: { id: locationId, organizationId: orgId },
  });
  if (!loc) throw new HttpError(404, 'NOT_FOUND', 'Location not found');

  const updated = await prisma.location.update({
    where: { id: locationId },
    data: {
      name,
      ...(timezone !== undefined
        ? { timezone: timezone === null ? undefined : timezone }
        : {}),
    },
  });
  return { id: updated.id, name: updated.name, timezone: updated.timezone ?? null };
}

export async function deleteLocation(orgId: string, locationId: string): Promise<void> {
  const loc = await prisma.location.findFirst({
    where: { id: locationId, organizationId: orgId },
  });
  if (!loc) throw new HttpError(404, 'NOT_FOUND', 'Location not found');

  await prisma.location.delete({ where: { id: locationId } });
}
