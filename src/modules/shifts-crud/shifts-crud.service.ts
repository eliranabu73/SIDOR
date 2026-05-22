import { prisma } from '../../db/prisma.js';
import { NotFoundError, ValidationFailedError } from '../../shared/errors.js';

export type ShiftResponse = {
  id: string;
  scheduleId: string;
  locationId: string;
  roleId: string;
  startAtUtc: string;
  endAtUtc: string;
  requiredEmployeeCount: number;
  status: string;
  timezone: string;
  version: number;
};

type ShiftRow = {
  id: string;
  scheduleId: string | null;
  locationId: string | null;
  roleId: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
  requiredEmployeeCount: number;
  status: string;
  timezone: string;
  version: number;
};

function mapShift(s: ShiftRow): ShiftResponse {
  return {
    id: s.id,
    scheduleId: s.scheduleId ?? '',
    locationId: s.locationId ?? '',
    roleId: s.roleId ?? '',
    startAtUtc: s.startAtUtc.toISOString(),
    endAtUtc: s.endAtUtc.toISOString(),
    requiredEmployeeCount: s.requiredEmployeeCount,
    status: s.status,
    timezone: s.timezone,
    version: s.version,
  };
}

function toLocalDate(d: Date): Date {
  // Use UTC date portion. localStartDate/localEndDate are @db.Date which strips
  // time. Caller passes UTC instants; deriving a calendar Date from the UTC
  // instant is acceptable for MVP — timezone shifting can refine later.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type CreateShiftInput = {
  orgId: string;
  scheduleId: string;
  locationId: string;
  roleId: string;
  startAtUtc: Date;
  endAtUtc: Date;
  requiredEmployeeCount?: number | undefined;
  timezone?: string | undefined;
};

export async function createShift(input: CreateShiftInput): Promise<ShiftResponse> {
  if (input.endAtUtc.getTime() <= input.startAtUtc.getTime()) {
    throw new ValidationFailedError('INVALID_RANGE', 'endAtUtc must be after startAtUtc');
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: input.scheduleId, organizationId: input.orgId },
  });
  if (!schedule) throw new NotFoundError('Schedule not found');

  const location = await prisma.location.findFirst({
    where: { id: input.locationId, organizationId: input.orgId },
  });
  if (!location) throw new NotFoundError('Location not found');

  const role = await prisma.role.findFirst({
    where: { id: input.roleId, organizationId: input.orgId },
  });
  if (!role) throw new NotFoundError('Role not found');

  const timezone = input.timezone ?? 'Asia/Jerusalem';
  const created = await prisma.shift.create({
    data: {
      organizationId: input.orgId,
      scheduleId: input.scheduleId,
      locationId: input.locationId,
      roleId: input.roleId,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      timezone,
      localStartDate: toLocalDate(input.startAtUtc),
      localEndDate: toLocalDate(input.endAtUtc),
      requiredEmployeeCount: input.requiredEmployeeCount ?? 1,
      status: 'PLANNED',
      version: 1,
    },
  });

  return mapShift(created);
}

export type UpdateShiftInput = {
  orgId: string;
  id: string;
  startAtUtc?: Date | undefined;
  endAtUtc?: Date | undefined;
  requiredEmployeeCount?: number | undefined;
  locationId?: string | undefined;
  roleId?: string | undefined;
};

export async function updateShift(input: UpdateShiftInput): Promise<ShiftResponse> {
  const existing = await prisma.shift.findFirst({
    where: { id: input.id, organizationId: input.orgId },
  });
  if (!existing) throw new NotFoundError('Shift not found');

  const newStart = input.startAtUtc ?? existing.startAtUtc;
  const newEnd = input.endAtUtc ?? existing.endAtUtc;
  if (newEnd.getTime() <= newStart.getTime()) {
    throw new ValidationFailedError('INVALID_RANGE', 'endAtUtc must be after startAtUtc');
  }

  if (input.locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: input.locationId, organizationId: input.orgId },
    });
    if (!loc) throw new NotFoundError('Location not found');
  }
  if (input.roleId) {
    const role = await prisma.role.findFirst({
      where: { id: input.roleId, organizationId: input.orgId },
    });
    if (!role) throw new NotFoundError('Role not found');
  }

  const data: Record<string, unknown> = {};
  if (input.startAtUtc !== undefined) {
    data['startAtUtc'] = input.startAtUtc;
    data['localStartDate'] = toLocalDate(input.startAtUtc);
  }
  if (input.endAtUtc !== undefined) {
    data['endAtUtc'] = input.endAtUtc;
    data['localEndDate'] = toLocalDate(input.endAtUtc);
  }
  if (input.requiredEmployeeCount !== undefined) {
    data['requiredEmployeeCount'] = input.requiredEmployeeCount;
  }
  if (input.locationId !== undefined) data['locationId'] = input.locationId;
  if (input.roleId !== undefined) data['roleId'] = input.roleId;

  const updated = await prisma.shift.update({ where: { id: input.id }, data });
  return mapShift(updated);
}

export async function cancelShift(orgId: string, id: string): Promise<ShiftResponse> {
  const existing = await prisma.shift.findFirst({ where: { id, organizationId: orgId } });
  if (!existing) throw new NotFoundError('Shift not found');
  const updated = await prisma.shift.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
  return mapShift(updated);
}
