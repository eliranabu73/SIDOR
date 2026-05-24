import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';

/**
 * Build an org-scoped DB handle.
 *
 * - When the request was authenticated, `req.orgPrisma` is a wrapper that
 *   opens a transaction and sets `app.current_org_id`, activating the RLS
 *   policy (WS-5d Task 2).
 * - When `AUTH_DISABLED=true` (dev/demo) `req.orgPrisma` is undefined because
 *   `app.authenticate` was skipped; we fall back to direct prisma. The RLS
 *   policy is NOT enforced in that case — acceptable for dev/demo only.
 */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}
import { HttpError, NotFoundError } from '../../shared/errors';

/**
 * Read-only routes used by the live Next.js frontend.
 *
 * MVP scope: hard-coded to the demo org. Future work will resolve
 * org from `req.user.orgId` once Supabase JWTs are wired through.
 */
// Demo org UUID — used ONLY as a fallback when AUTH_DISABLED=true (dev/demo).
// Production reads always scope by req.user.orgId.
const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

const ScheduleIdParam = z.object({ scheduleId: z.string() });
const ScheduleQuery = z.object({ weekStart: z.string().optional() });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function devAllowed(): boolean {
  // Reads are public for the demo deployment. AUTH_DISABLED=true skips JWT
  // checks regardless of NODE_ENV so the Vercel demo can fetch data without
  // a Supabase session. Tighten before adding multi-tenant data.
  return process.env['AUTH_DISABLED'] === 'true';
}

type AssignmentRow = {
  id: string;
  shiftId: string;
  employeeId: string;
  assignmentStatus: string;
  createdAt: Date;
};

function mapAssignmentStatus(s: string): 'assigned' | 'tentative' | 'swapped' | 'cancelled' {
  switch (s) {
    case 'CONFIRMED':
      return 'assigned';
    case 'PROPOSED':
      return 'tentative';
    case 'CANCELLED':
    case 'DECLINED':
      return 'cancelled';
    case 'COMPLETED':
      return 'assigned';
    default:
      return 'cancelled';
  }
}

export function mapAssignment(a: AssignmentRow) {
  return {
    id: a.id,
    shiftId: a.shiftId,
    employeeId: a.employeeId,
    status: mapAssignmentStatus(a.assignmentStatus),
    createdAt: a.createdAt.toISOString(),
  };
}

export function mapShift(s: {
  id: string;
  scheduleId: string | null;
  locationId: string | null;
  role: { name: string } | null;
  startAtUtc: Date;
  endAtUtc: Date;
  requiredEmployeeCount: number;
  version: number;
  isOpenShift: boolean;
  assignments: AssignmentRow[];
}) {
  return {
    id: s.id,
    scheduleId: s.scheduleId ?? '',
    locationId: s.locationId ?? '',
    role: s.role?.name ?? '',
    startsAt: s.startAtUtc.toISOString(),
    endsAt: s.endAtUtc.toISOString(),
    requiredCount: s.requiredEmployeeCount,
    version: s.version,
    isOpen: s.isOpenShift,
    assignments: s.assignments.map(mapAssignment),
  };
}

export function mapSchedule(sched: {
  id: string;
  organizationId: string;
  periodStartDate: Date;
  status: string;
  shifts: Array<Parameters<typeof mapShift>[0]>;
}) {
  return {
    id: sched.id,
    orgId: sched.organizationId,
    weekStart: sched.periodStartDate.toISOString(),
    status: sched.status.toLowerCase(),
    shifts: sched.shifts.map(mapShift),
  };
}

export async function readsRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  const EmployeesQuery = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  app.get(
    '/employees',
    { schema: { querystring: EmployeesQuery }, preHandler: authHandlers },
    /**
     * RLS POC (WS-5d Task 2): uses req.orgPrisma (withOrgContext wrapper) when
     * the user has been authenticated, so the query runs inside a transaction
     * that first executes `SET LOCAL app.current_org_id = '<orgId>'`.
     *
     * When AUTH_DISABLED is true (dev/demo mode), req.orgPrisma is undefined
     * because app.authenticate was skipped; we fall back to direct prisma.
     *
     * Pagination: optional `page` and `limit` query params. Default limit is
     * 500 (backwards-compatible — existing callers get all employees when no
     * params are provided). When `page` is given, limit defaults to 50.
     */
    async (req, reply) => {
      try {
        const orgId = orgIdFor(req);
        const db = dbFor(req);
        const { page, limit: limitParam } = req.query as z.infer<typeof EmployeesQuery>;
        const paginated = page != null;
        const limit = paginated ? (limitParam ?? 50) : (limitParam ?? 500);
        const skip = paginated ? (page - 1) * limit : 0;

        const employees = await db.query((tx) =>
          tx.employee.findMany({
            where: { organizationId: orgId, isActive: true },
            include: { roles: { include: { role: true } } },
            orderBy: { fullName: 'asc' },
            take: limit,
            skip,
          }),
        );

        return reply.send(
          employees.map((e) => ({
            id: e.id,
            orgId: e.organizationId,
            fullName: e.fullName,
            email: e.email,
            phone: e.phone,
            roles: e.roles.map((er) => er.role.name),
            primaryLocationId: e.defaultLocationId,
            active: e.isActive,
          })),
        );
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.get(
    '/schedules/:scheduleId',
    {
      schema: { params: ScheduleIdParam, querystring: ScheduleQuery },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const { weekStart } = req.query as z.infer<typeof ScheduleQuery>;

      try {
        let schedule;
        const orgId = orgIdFor(req);
        const db = dbFor(req);
        const includeShifts = {
          shifts: {
            include: { role: true, assignments: true },
            orderBy: { startAtUtc: 'asc' as const },
          },
        };

        if (UUID_RE.test(scheduleId)) {
          // Real UUID — direct lookup, org-scoped.
          schedule = await db.query((tx) =>
            tx.schedule.findFirst({
              where: { id: scheduleId, organizationId: orgId },
              include: includeShifts,
            }),
          );
        } else if (weekStart) {
          // Pseudo id like "sched_2026-05-17" or "current" with explicit weekStart.
          const start = new Date(weekStart);
          const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          schedule = await db.query((tx) =>
            tx.schedule.findFirst({
              where: {
                organizationId: orgId,
                periodStartDate: { gte: start, lt: end },
              },
              orderBy: { periodStartDate: 'desc' },
              include: includeShifts,
            }),
          );
        } else {
          // Fallback — most recent schedule whose period started.
          schedule = await db.query((tx) =>
            tx.schedule.findFirst({
              where: {
                organizationId: orgId,
                periodStartDate: { lte: new Date() },
              },
              orderBy: { periodStartDate: 'desc' },
              include: includeShifts,
            }),
          );
        }

        // No matching schedule but valid week — return empty shell so the
        // UI renders the EmptyScheduleState instead of an error banner.
        if (!schedule && weekStart) {
          return reply.send({
            id: scheduleId,
            orgId,
            weekStart: new Date(weekStart).toISOString(),
            status: 'draft',
            shifts: [],
          });
        }

        if (!schedule) throw new NotFoundError('Schedule not found');
        return reply.send(mapSchedule(schedule));
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // Ensure a schedule row exists for the given week. Used by the frontend
  // before creating a shift in an empty week (the EmptyScheduleState flow).
  // Idempotent — returns the existing schedule if one already covers that day.
  app.post(
    '/schedules/ensure',
    {
      schema: { body: z.object({ weekStart: z.string() }) },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { weekStart } = req.body as { weekStart: string };
      const orgId = orgIdFor(req);
      const db = dbFor(req);
      try {
        const start = new Date(weekStart);
        const end = new Date(start.getTime() + 7 * 86400000);
        let schedule = await db.query((tx) =>
          tx.schedule.findFirst({
            where: {
              organizationId: orgId,
              periodStartDate: { gte: start, lt: end },
            },
          }),
        );
        if (!schedule) {
          schedule = await db.query((tx) =>
            tx.schedule.create({
              data: {
                organizationId: orgId,
                name: `שבוע ${start.toISOString().slice(0, 10)}`,
                periodStartDate: start,
                periodEndDate: new Date(start.getTime() + 6 * 86400000),
                timezone: 'Asia/Jerusalem',
                status: 'DRAFT',
                createdByUserId: req.user?.id ?? null,
              },
            }),
          );
        }
        return reply.send({
          id: schedule.id,
          weekStart: schedule.periodStartDate.toISOString(),
          status: schedule.status.toLowerCase(),
        });
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );
}

function handleHttpError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply
      .code(err.statusCode)
      .send({ code: err.code, message: err.message, details: err.details ?? null });
  }
  reply.log.error(err);
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message });
}
