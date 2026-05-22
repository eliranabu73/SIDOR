import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { HttpError, NotFoundError } from '../../shared/errors';

/**
 * Read-only routes used by the live Next.js frontend.
 *
 * MVP scope: hard-coded to the demo org. Future work will resolve
 * org from `req.user.orgId` once Supabase JWTs are wired through.
 */
const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

const ScheduleIdParam = z.object({ scheduleId: z.string() });
const ScheduleQuery = z.object({ weekStart: z.string().optional() });

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

  app.get(
    '/employees',
    { preHandler: authHandlers },
    async (_req, reply) => {
      try {
        const employees = await prisma.employee.findMany({
          where: { organizationId: DEMO_ORG_ID, isActive: true },
          include: { roles: { include: { role: true } } },
          orderBy: { fullName: 'asc' },
        });

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

      try {
        let schedule;

        if (scheduleId === 'current') {
          // Look up most recent schedule for the demo org whose period has started.
          schedule = await prisma.schedule.findFirst({
            where: {
              organizationId: DEMO_ORG_ID,
              periodStartDate: { lte: new Date() },
            },
            orderBy: { periodStartDate: 'desc' },
            include: {
              shifts: {
                include: { role: true, assignments: true },
                orderBy: { startAtUtc: 'asc' },
              },
            },
          });
        } else {
          schedule = await prisma.schedule.findUnique({
            where: { id: scheduleId },
            include: {
              shifts: {
                include: { role: true, assignments: true },
                orderBy: { startAtUtc: 'asc' },
              },
            },
          });
        }

        if (!schedule) throw new NotFoundError('Schedule not found');
        return reply.send(mapSchedule(schedule));
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
