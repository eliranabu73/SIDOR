/**
 * Time-tracking routes — שעון נוכחות
 *
 * JWT-authenticated (manager + employee via session):
 *   POST   /v1/timetracking/clock-in
 *   POST   /v1/timetracking/clock-out
 *   GET    /v1/timetracking/status
 *   GET    /v1/timetracking/entries          ?from=&to=[&employeeId=]
 *   PATCH  /v1/timetracking/entries/:id
 *
 * HMAC share-token (employee self-service, no JWT):
 *   POST   /v1/timetracking/token/:token/clock-in
 *   POST   /v1/timetracking/token/:token/clock-out
 *   GET    /v1/timetracking/token/:token/status
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  clockIn,
  clockOut,
  getOpenEntry,
  listEntries,
  patchEntry,
} from './timetracking.service';
import { verifyEmployeeToken } from '../share/share.service';
import { prisma } from '../../db/prisma';

// ---------------------------------------------------------------------------
// Helpers (mirrors pattern used by tips.routes.ts / payroll.routes.ts)
// ---------------------------------------------------------------------------

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
const DEMO_EMP_ID = '20000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId?: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

function empIdFor(req: { user?: { employeeId?: string; id?: string } }): string {
  // Support both session shapes: { employeeId } or { id } (fallback to demo).
  return req.user?.employeeId ?? req.user?.id ?? DEMO_EMP_ID;
}

function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ClockInBody = z.object({
  shiftAssignmentId: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().max(500).optional(),
});

const ClockOutBody = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const EntriesQuery = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  employeeId: z.string().uuid().optional(),
});

const PatchEntryBody = z.object({
  clockInAt: z.string().datetime({ offset: true }).optional(),
  clockOutAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().max(500).optional(),
});

const TokenParam = z.object({ token: z.string().min(10) });
const EntryIdParam = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function timetrackingRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // -------------------------------------------------------------------------
  // POST /v1/timetracking/clock-in  — JWT session
  // -------------------------------------------------------------------------
  app.post(
    '/timetracking/clock-in',
    { schema: { body: ClockInBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof ClockInBody>;
      const entry = await clockIn(
        {
          organizationId: orgIdFor(req),
          employeeId: empIdFor(req),
          shiftAssignmentId: body.shiftAssignmentId,
          lat: body.lat,
          lng: body.lng,
          note: body.note,
        },
        prisma,
      );
      return reply.code(201).send(entry);
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/timetracking/clock-out  — JWT session
  // -------------------------------------------------------------------------
  app.post(
    '/timetracking/clock-out',
    { schema: { body: ClockOutBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof ClockOutBody>;
      const entry = await clockOut(
        {
          organizationId: orgIdFor(req),
          employeeId: empIdFor(req),
          lat: body.lat,
          lng: body.lng,
        },
        prisma,
      );
      return reply.send(entry);
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/timetracking/status  — JWT session
  // -------------------------------------------------------------------------
  app.get(
    '/timetracking/status',
    { preHandler: authHandlers },
    async (req) => {
      const open = await getOpenEntry(orgIdFor(req), empIdFor(req), prisma);
      return { clockedIn: open !== null, entry: open };
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/timetracking/entries  — JWT session (manager view)
  // -------------------------------------------------------------------------
  app.get(
    '/timetracking/entries',
    { schema: { querystring: EntriesQuery }, preHandler: authHandlers },
    async (req) => {
      const q = req.query as z.infer<typeof EntriesQuery>;
      const entries = await listEntries(
        {
          organizationId: orgIdFor(req),
          employeeId: q.employeeId,
          from: new Date(q.from),
          to: new Date(q.to),
        },
        prisma,
      );
      return entries;
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /v1/timetracking/entries/:id  — JWT session (manager correction)
  // -------------------------------------------------------------------------
  app.patch(
    '/timetracking/entries/:id',
    { schema: { params: EntryIdParam, body: PatchEntryBody }, preHandler: authHandlers },
    async (req) => {
      const { id } = req.params as z.infer<typeof EntryIdParam>;
      const body = req.body as z.infer<typeof PatchEntryBody>;

      const entry = await patchEntry(
        {
          id,
          organizationId: orgIdFor(req),
          ...(body.clockInAt !== undefined
            ? { clockInAt: new Date(body.clockInAt) }
            : {}),
          ...(body.clockOutAt !== undefined
            ? { clockOutAt: body.clockOutAt === null ? null : new Date(body.clockOutAt) }
            : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
        prisma,
      );
      return entry;
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/timetracking/live  — JWT session (manager dashboard live view)
  // Returns all open (clocked-in) entries for the org with elapsed seconds.
  // -------------------------------------------------------------------------
  app.get(
    '/timetracking/live',
    { preHandler: authHandlers },
    async (req) => {
      const orgId = orgIdFor(req);
      const openEntries = await prisma.timeEntry.findMany({
        where: { organizationId: orgId, clockOutAt: null },
        include: { employee: { select: { id: true, fullName: true } } },
        orderBy: { clockInAt: 'asc' },
      });
      const now = Date.now();
      return {
        count: openEntries.length,
        employees: openEntries.map((e) => ({
          employeeId: e.employeeId,
          fullName: e.employee.fullName,
          clockInAt: e.clockInAt.toISOString(),
          elapsedSeconds: Math.floor((now - e.clockInAt.getTime()) / 1000),
          shiftAssignmentId: e.shiftAssignmentId ?? null,
          lat: e.clockInLat ?? null,
          lng: e.clockInLng ?? null,
        })),
      };
    },
  );

  // =========================================================================
  // HMAC share-token routes — employee self-service (no JWT)
  // =========================================================================

  /** Resolve and validate an employee portal token from the URL param. */
  function resolveToken(token: string, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
    const decoded = verifyEmployeeToken(token);
    if (!decoded) {
      reply.code(401).send({ code: 'INVALID_TOKEN', message: 'הקישור אינו תקף או פג תוקפו' });
      return null;
    }
    if (decoded.intent !== 'employee_portal') {
      reply.code(403).send({ code: 'WRONG_INTENT', message: 'הקישור אינו מיועד לשעון נוכחות' });
      return null;
    }
    return decoded;
  }

  // -------------------------------------------------------------------------
  // POST /v1/timetracking/token/:token/clock-in
  // -------------------------------------------------------------------------
  app.post(
    '/timetracking/token/:token/clock-in',
    { schema: { params: TokenParam, body: ClockInBody } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const decoded = resolveToken(token, reply);
      if (!decoded) return;

      const body = req.body as z.infer<typeof ClockInBody>;
      const entry = await clockIn(
        {
          organizationId: decoded.organizationId,
          employeeId: decoded.employeeId,
          shiftAssignmentId: body.shiftAssignmentId,
          lat: body.lat,
          lng: body.lng,
          note: body.note,
        },
        prisma,
      );
      return reply.code(201).send(entry);
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/timetracking/token/:token/clock-out
  // -------------------------------------------------------------------------
  app.post(
    '/timetracking/token/:token/clock-out',
    { schema: { params: TokenParam, body: ClockOutBody } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const decoded = resolveToken(token, reply);
      if (!decoded) return;

      const body = req.body as z.infer<typeof ClockOutBody>;
      const entry = await clockOut(
        {
          organizationId: decoded.organizationId,
          employeeId: decoded.employeeId,
          lat: body.lat,
          lng: body.lng,
        },
        prisma,
      );
      return reply.send(entry);
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/timetracking/token/:token/status
  // -------------------------------------------------------------------------
  app.get(
    '/timetracking/token/:token/status',
    { schema: { params: TokenParam } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const decoded = resolveToken(token, reply);
      if (!decoded) return;

      const open = await getOpenEntry(decoded.organizationId, decoded.employeeId, prisma);
      return reply.send({ clockedIn: open !== null, entry: open });
    },
  );
}
