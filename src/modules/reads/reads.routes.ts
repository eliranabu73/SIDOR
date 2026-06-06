import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma, withAdminContext } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';
import { locationScope, employeeLocationScope } from '../../shared/location-scope';
import { listLocations } from '../employees/employees.service';
import { listMemberships } from '../onboarding/onboarding.service';

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

// Shape of the org-scoped DB handle used across reads routes.
type ScopedDb = { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> };

// The shift include used by the schedule grid — trimmed to grid-only fields.
// `role: true` selects the role row once (no N+1: Prisma joins it per shift in
// a single query), and we only read `role.name` downstream via mapShift.
const SCHEDULE_SHIFT_INCLUDE = {
  shifts: {
    // Cancelled shifts are soft-deleted — exclude them so a deleted shift
    // disappears from the grid (DELETE /shifts/:id sets CANCELLED).
    where: { status: { not: 'CANCELLED' as const } },
    include: { role: true, assignments: true },
    orderBy: { startAtUtc: 'asc' as const },
  },
} as const;

/**
 * Resolve the canonical schedule (with grid shifts) for a request, mirroring
 * GET /schedules/:scheduleId exactly so the unified dashboard binds to the same
 * row as every other flow (grid, copy, auto-schedule, template).
 *
 * Returns null when no schedule matches (caller renders the empty shell).
 */
async function resolveScheduleForWeek(
  db: ScopedDb,
  orgId: string,
  scheduleId: string,
  weekStart: string | undefined,
  schedScope: { locationId?: string },
) {
  if (UUID_RE.test(scheduleId)) {
    return db.query((tx) =>
      tx.schedule.findFirst({
        where: { id: scheduleId, organizationId: orgId, ...schedScope },
        include: SCHEDULE_SHIFT_INCLUDE,
      }),
    );
  }
  if (weekStart) {
    const start = new Date(weekStart);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const candidates = await db.query((tx) =>
      tx.schedule.findMany({
        where: {
          organizationId: orgId,
          periodStartDate: { gte: start, lt: end },
          ...schedScope,
        },
        orderBy: { createdAt: 'asc' },
        include: SCHEDULE_SHIFT_INCLUDE,
      }),
    );
    return candidates.find((s) => s.shifts.length > 0) ?? candidates[0] ?? null;
  }
  return db.query((tx) =>
    tx.schedule.findFirst({
      where: {
        organizationId: orgId,
        periodStartDate: { lte: new Date() },
        ...schedScope,
      },
      orderBy: { periodStartDate: 'desc' },
      include: SCHEDULE_SHIFT_INCLUDE,
    }),
  );
}

// Active employees for an org, mapped to the exact shape GET /employees returns
// so the dashboard payload is byte-compatible with the page's current parsing.
// `roles` is joined once per employee (no N+1); only role.name is read.
async function fetchEmployeesForOrg(
  db: ScopedDb,
  orgId: string,
  empScope: { defaultLocationId?: string },
) {
  const employees = await db.query((tx) =>
    tx.employee.findMany({
      where: { organizationId: orgId, isActive: true, ...empScope },
      include: { roles: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
      take: 500,
    }),
  );
  return employees.map((e) => ({
    id: e.id,
    orgId: e.organizationId,
    fullName: e.fullName,
    email: e.email,
    phone: e.phone,
    roles: e.roles.map((er) => er.role.name),
    primaryLocationId: e.defaultLocationId,
    // Keep byte-compatible with GET /employees: it returns hourlyRate, so the
    // dashboard (now the page's single source) must too — otherwise client-side
    // labour-cost calc reads undefined/0.
    hourlyRate: Number(e.hourlyRate),
    active: e.isActive,
  }));
}

/**
 * Resolve the `me` block for the dashboard, identical in shape to GET /v1/me
 * ({ user, memberships, activeOrgId }). When authenticated we read memberships
 * via admin context (cross-tenant discovery, same as /v1/me). In demo mode
 * (AUTH_DISABLED) there is no real user, so we return a minimal owner stub
 * scoped to the demo org — enough for the page to render the org name + role.
 */
async function resolveMe(req: {
  user?: { id: string; orgId: string; role: string };
}, orgId: string) {
  const u = req.user;
  if (!u) {
    return {
      user: { id: '', role: 'owner' },
      memberships: [] as Array<{ orgId: string; orgName: string; role: string }>,
      activeOrgId: orgId,
    };
  }
  const adminDb = withAdminContext();
  const memberships = await adminDb.query((tx) => listMemberships(u.id, tx));
  const activeOrgId =
    memberships.find((m) => m.orgId === u.orgId)?.orgId ?? memberships[0]?.orgId ?? null;
  return { user: { id: u.id, role: u.role }, memberships, activeOrgId };
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

        const empScope = employeeLocationScope(req.user ?? { role: '' });
        const employees = await db.query((tx) =>
          tx.employee.findMany({
            where: { organizationId: orgId, isActive: true, ...empScope },
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
            hourlyRate: Number(e.hourlyRate),
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
        const orgId = orgIdFor(req);
        const db = dbFor(req);
        const schedScope = locationScope(req.user ?? { role: '' });
        // Deterministic pick shared with GET /dashboard and POST /schedules/ensure
        // so the grid, copy, auto-schedule and template all act on the same row.
        const schedule = await resolveScheduleForWeek(
          db,
          orgId,
          scheduleId,
          weekStart,
          schedScope,
        );

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

  // GET /v1/dashboard?scheduleId=&weekStart=
  //
  // Unified read for the schedule page: returns the same data the page used to
  // fetch via 5 separate calls (schedule + shifts, employees, locations, me) in
  // ONE org-scoped response. Each block is identical in shape to its dedicated
  // endpoint so page.tsx can swap its hooks with minimal churn.
  //
  // Org scoping + RLS work exactly like the other reads routes: orgIdFor(req)
  // resolves the org (real JWT, demo fallback when AUTH_DISABLED), and dbFor(req)
  // returns the withOrgContext wrapper that sets app.current_org_id per query.
  const DashboardQuery = z.object({
    scheduleId: z.string().optional(),
    weekStart: z.string().optional(),
  });

  app.get(
    '/dashboard',
    { schema: { querystring: DashboardQuery }, preHandler: authHandlers },
    async (req, reply) => {
      const { scheduleId, weekStart } = req.query as z.infer<typeof DashboardQuery>;
      try {
        const orgId = orgIdFor(req);
        const db = dbFor(req);
        const schedScope = locationScope(req.user ?? { role: '' });
        const empScope = employeeLocationScope(req.user ?? { role: '' });

        // Resolve schedule with the same deterministic pick as GET /schedules,
        // employees + locations in parallel, and `me` (auth-aware) alongside.
        const [scheduleRow, employees, locations, me] = await Promise.all([
          resolveScheduleForWeek(db, orgId, scheduleId ?? 'current', weekStart, schedScope),
          fetchEmployeesForOrg(db, orgId, empScope),
          db.query((tx) => listLocations(orgId, tx)),
          resolveMe(req, orgId),
        ]);

        // Mirror GET /schedules: empty shell when no row matches but a week is
        // given, so the page renders EmptyScheduleState instead of an error.
        const schedule = scheduleRow
          ? mapSchedule(scheduleRow)
          : weekStart
            ? {
                id: scheduleId ?? '',
                orgId,
                weekStart: new Date(weekStart).toISOString(),
                status: 'draft',
                shifts: [] as ReturnType<typeof mapShift>[],
              }
            : null;

        if (!schedule) throw new NotFoundError('Schedule not found');

        return reply.send({
          schedule,
          // `shifts` surfaced at the top level too (contract: schedule+shifts),
          // so callers can read either schedule.shifts or the flat array.
          shifts: schedule.shifts,
          employees,
          locations,
          me,
        });
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
        // Deterministic pick (same rule as GET /schedules): prefer the row with
        // shifts, else the oldest. Prevents binding to an empty duplicate.
        const existingForWeek = await db.query((tx) =>
          tx.schedule.findMany({
            where: {
              organizationId: orgId,
              periodStartDate: { gte: start, lt: end },
            },
            orderBy: { createdAt: 'asc' },
            include: { _count: { select: { shifts: true } } },
          }),
        );
        let schedule: { id: string; periodStartDate: Date; status: string } | null =
          existingForWeek.find((s) => s._count.shifts > 0) ??
          existingForWeek[0] ??
          null;
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
