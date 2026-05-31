import type { Prisma } from '@prisma/client';
import { prisma as defaultPrisma, ensureTx } from '../../db/prisma.js';
import type { Db } from '../../db/prisma.js';
import { NotFoundError } from '../../shared/errors.js';

const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'INTERN',
] as const;
export type EmploymentTypeLiteral = (typeof EMPLOYMENT_TYPES)[number];

export type EmployeeResponse = {
  id: string;
  orgId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  primaryLocationId: string | null;
  active: boolean;
  hourlyRate: number;
  hireDate: string | null;
  weeklyBudgetHours: number | null;
};

type EmployeeWithRoles = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  defaultLocationId: string | null;
  isActive: boolean;
  hourlyRate: Prisma.Decimal;
  hireDate: Date | null;
  weeklyBudgetHours: number | null;
  roles: Array<{ role: { name: string } }>;
};

function mapEmployee(e: EmployeeWithRoles): EmployeeResponse {
  return {
    id: e.id,
    orgId: e.organizationId,
    fullName: e.fullName,
    email: e.email,
    phone: e.phone,
    roles: e.roles.map((er) => er.role.name),
    primaryLocationId: e.defaultLocationId,
    active: e.isActive,
    hourlyRate: Number(e.hourlyRate),
    hireDate: e.hireDate ? e.hireDate.toISOString().slice(0, 10) : null,
    weeklyBudgetHours: e.weeklyBudgetHours,
  };
}

export type CreateEmployeeInput = {
  orgId: string;
  fullName: string;
  email?: string | undefined;
  phone?: string | undefined;
  employmentType?: EmploymentTypeLiteral | undefined;
  roleIds?: string[] | undefined;
  defaultLocationId?: string | undefined;
  hourlyRate?: number | undefined;
  hireDate?: string | null | undefined;
  weeklyBudgetHours?: number | null | undefined;
};

export async function createEmployee(
  input: CreateEmployeeInput,
  db: Db = defaultPrisma,
): Promise<EmployeeResponse> {
  const roleIds = input.roleIds ?? [];
  if (roleIds.length > 0) {
    const count = await db.role.count({
      where: { id: { in: roleIds }, organizationId: input.orgId },
    });
    if (count !== roleIds.length) {
      throw new NotFoundError('One or more roleIds not found in organization');
    }
  }
  if (input.defaultLocationId) {
    const loc = await db.location.findFirst({
      where: { id: input.defaultLocationId, organizationId: input.orgId },
    });
    if (!loc) throw new NotFoundError('defaultLocationId not found in organization');
  }

  const created = await db.employee.create({
    data: {
      organizationId: input.orgId,
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      employmentType: input.employmentType ?? 'FULL_TIME',
      defaultLocationId: input.defaultLocationId ?? null,
      ...(input.hourlyRate !== undefined ? { hourlyRate: input.hourlyRate } : {}),
      ...(input.hireDate !== undefined
        ? { hireDate: input.hireDate ? new Date(input.hireDate) : null }
        : {}),
      ...(input.weeklyBudgetHours !== undefined
        ? { weeklyBudgetHours: input.weeklyBudgetHours }
        : {}),
      roles: roleIds.length
        ? { create: roleIds.map((roleId) => ({ roleId })) }
        : undefined,
    },
    include: { roles: { include: { role: true } } },
  });

  return mapEmployee(created);
}

export type UpdateEmployeeInput = {
  orgId: string;
  id: string;
  fullName?: string | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  employmentType?: EmploymentTypeLiteral | undefined;
  roleIds?: string[] | undefined;
  defaultLocationId?: string | null | undefined;
  hourlyRate?: number | undefined;
  hireDate?: string | null | undefined;
  weeklyBudgetHours?: number | null | undefined;
};

export async function updateEmployee(
  input: UpdateEmployeeInput,
  db: Db = defaultPrisma,
): Promise<EmployeeResponse> {
  const existing = await db.employee.findFirst({
    where: { id: input.id, organizationId: input.orgId },
  });
  if (!existing) throw new NotFoundError('Employee not found');

  if (input.roleIds) {
    if (input.roleIds.length > 0) {
      const count = await db.role.count({
        where: { id: { in: input.roleIds }, organizationId: input.orgId },
      });
      if (count !== input.roleIds.length) {
        throw new NotFoundError('One or more roleIds not found in organization');
      }
    }
  }
  if (input.defaultLocationId) {
    const loc = await db.location.findFirst({
      where: { id: input.defaultLocationId, organizationId: input.orgId },
    });
    if (!loc) throw new NotFoundError('defaultLocationId not found in organization');
  }

  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data['fullName'] = input.fullName;
  if (input.email !== undefined) data['email'] = input.email;
  if (input.phone !== undefined) data['phone'] = input.phone;
  if (input.employmentType !== undefined) data['employmentType'] = input.employmentType;
  if (input.defaultLocationId !== undefined) data['defaultLocationId'] = input.defaultLocationId;
  if (input.hourlyRate !== undefined) data['hourlyRate'] = input.hourlyRate;
  if (input.hireDate !== undefined)
    data['hireDate'] = input.hireDate ? new Date(input.hireDate) : null;
  if (input.weeklyBudgetHours !== undefined)
    data['weeklyBudgetHours'] = input.weeklyBudgetHours;

  await ensureTx(db, async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.employee.update({ where: { id: input.id }, data });
    }
    if (input.roleIds) {
      await tx.employeeRole.deleteMany({ where: { employeeId: input.id } });
      if (input.roleIds.length > 0) {
        await tx.employeeRole.createMany({
          data: input.roleIds.map((roleId) => ({ employeeId: input.id, roleId })),
          skipDuplicates: true,
        });
      }
    }
  });

  const updated = await db.employee.findFirstOrThrow({
    where: { id: input.id, organizationId: input.orgId },
    include: { roles: { include: { role: true } } },
  });
  return mapEmployee(updated);
}

export async function softDeleteEmployee(
  orgId: string,
  id: string,
  db: Db = defaultPrisma,
): Promise<EmployeeResponse> {
  const existing = await db.employee.findFirst({ where: { id, organizationId: orgId } });
  if (!existing) throw new NotFoundError('Employee not found');
  await db.employee.update({ where: { id }, data: { isActive: false } });
  const updated = await db.employee.findFirstOrThrow({
    where: { id, organizationId: orgId },
    include: { roles: { include: { role: true } } },
  });
  return mapEmployee(updated);
}

export async function listLocations(
  orgId: string,
  db: Db = defaultPrisma,
): Promise<Array<{ id: string; name: string; timezone: string }>> {
  const rows = await db.location.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, timezone: true },
  });
  return rows;
}

export async function listRoles(
  orgId: string,
  db: Db = defaultPrisma,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.role.findMany({
    where: { organizationId: orgId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return rows;
}

export async function createRole(
  orgId: string,
  name: string,
  db: Db = defaultPrisma,
): Promise<{ id: string; name: string }> {
  const row = await db.role.create({
    data: { organizationId: orgId, name },
    select: { id: true, name: true },
  });
  return row;
}

export async function createLocation(
  orgId: string,
  name: string,
  timezone: string | undefined,
  db: Db = defaultPrisma,
): Promise<{ id: string; name: string; timezone: string }> {
  const row = await db.location.create({
    data: { organizationId: orgId, name, timezone: timezone ?? 'Asia/Jerusalem' },
    select: { id: true, name: true, timezone: true },
  });
  return row;
}
