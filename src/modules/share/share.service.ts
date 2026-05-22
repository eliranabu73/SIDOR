import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../env';
import { prisma } from '../../db/prisma';

/**
 * Stateless signed share tokens for employee read-only access.
 * Format: base64url(JSON({ eid, oid, exp })).base64url(HMAC-SHA256)
 *
 * - No DB row needed; rotation = bump EMPLOYEE_SHARE_SECRET.
 * - exp is unix seconds; default 90 days.
 * - eid bound to oid so a leaked token can't cross orgs.
 */

const SECRET = env.EMPLOYEE_SHARE_SECRET || env.JWT_SECRET;

function b64u(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function signEmployeeToken(input: {
  employeeId: string;
  organizationId: string;
  ttlSeconds?: number;
}): string {
  const payload = {
    eid: input.employeeId,
    oid: input.organizationId,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 60 * 60 * 24 * 90),
  };
  const head = b64u(JSON.stringify(payload));
  const sig = b64u(createHmac('sha256', SECRET).update(head).digest());
  return `${head}.${sig}`;
}

export type DecodedShareToken = {
  employeeId: string;
  organizationId: string;
  exp: number;
};

export function verifyEmployeeToken(token: string): DecodedShareToken | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [head, sig] = parts;
  if (!head || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(head).digest();
  const provided = b64uDecode(sig);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  let payload: { eid: string; oid: string; exp: number };
  try {
    payload = JSON.parse(b64uDecode(head).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) {
    return null;
  }
  return { employeeId: payload.eid, organizationId: payload.oid, exp: payload.exp };
}

export function shareUrlForEmployee(token: string): string {
  return `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/e/${token}`;
}

export function whatsappLinkForPhone(phone: string | null | undefined, message: string): string {
  // wa.me wants international digits without "+" / leading 0.
  if (!phone) return `https://wa.me/?text=${encodeURIComponent(message)}`;
  const digits = phone.replace(/[^\d]/g, '');
  // Israeli local 05X → 9725X
  const normalised = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${normalised}?text=${encodeURIComponent(message)}`;
}

/**
 * Build the publish-to-WhatsApp message + per-employee deep links for a
 * given schedule. The manager paste-sends the group message; each employee
 * also gets a personal wa.me link the manager can DM individually.
 */
export async function buildPublishBundle(input: {
  scheduleId: string;
  organizationId: string;
}) {
  const schedule = await prisma.schedule.findFirst({
    where: { id: input.scheduleId, organizationId: input.organizationId },
  });
  if (!schedule) {
    throw Object.assign(new Error('Schedule not found'), { statusCode: 404 });
  }
  const employees = await prisma.employee.findMany({
    where: { organizationId: input.organizationId, isActive: true },
    select: { id: true, fullName: true, phone: true },
    orderBy: { fullName: 'asc' },
  });

  const weekStart = schedule.periodStartDate.toISOString().slice(0, 10);
  const weekEnd = new Date(schedule.periodStartDate.getTime() + 6 * 86400000)
    .toISOString()
    .slice(0, 10);

  const groupMessage =
    `📅 הסידור לשבוע ${weekStart} – ${weekEnd} פורסם!\n\n` +
    `כל אחד מקבל קישור אישי לצפייה במשמרות שלו.\n` +
    `שלחו אישור קבלה בתגובה.\n\n` +
    `– סידור4S`;

  const links = employees.map((e) => {
    const token = signEmployeeToken({
      employeeId: e.id,
      organizationId: input.organizationId,
    });
    const url = shareUrlForEmployee(token);
    const personal =
      `שלום ${e.fullName} 👋\n` +
      `הסידור שלך לשבוע ${weekStart}:\n${url}`;
    return {
      employeeId: e.id,
      fullName: e.fullName,
      phone: e.phone,
      url,
      whatsapp: whatsappLinkForPhone(e.phone, personal),
    };
  });

  return { weekStart, weekEnd, groupMessage, links };
}

/**
 * Read-only schedule view for one employee, derived from their share token.
 */
export async function fetchEmployeeView(employeeId: string, organizationId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId, isActive: true },
    select: { id: true, fullName: true, phone: true, email: true },
  });
  if (!employee) {
    throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  }
  const now = new Date();
  const horizon = new Date(now.getTime() + 21 * 86400000); // 3 weeks ahead
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId,
      shift: {
        organizationId,
        startAtUtc: { gte: new Date(now.getTime() - 86400000), lt: horizon },
        status: { not: 'CANCELLED' },
      },
      assignmentStatus: { in: ['CONFIRMED', 'COMPLETED', 'PROPOSED'] },
    },
    include: {
      shift: {
        include: { role: true, location: true },
      },
    },
    orderBy: { shift: { startAtUtc: 'asc' } },
  });

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, defaultTimezone: true },
  });

  return {
    employee,
    organization: org,
    shifts: assignments.map((a) => ({
      id: a.shift.id,
      startsAt: a.shift.startAtUtc.toISOString(),
      endsAt: a.shift.endAtUtc.toISOString(),
      role: a.shift.role?.name ?? null,
      location: a.shift.location?.name ?? null,
      status: a.assignmentStatus.toLowerCase(),
    })),
  };
}
