/**
 * Tips API routes — Israeli Tip Law 2022
 *
 * POST   /v1/tips          — record a new tip pool for a date
 * GET    /v1/tips          — list tip pools (by period)
 * GET    /v1/tips/preview  — preview distribution without saving
 * GET    /v1/tips/:id      — single pool with distribution details
 * DELETE /v1/tips/:id      — delete a pool (corrections)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  calculateTipDistribution,
  deleteTipPool,
  getTipPool,
  getTipPoolsForPeriod,
  recordTipPool,
} from './tips.service';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

function userIdFor(req: { user?: { id?: string; userId?: string } }): string | undefined {
  return req.user?.id ?? req.user?.userId;
}

function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

function dbFor(req: {
  orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> };
}) {
  return (
    req.orgPrisma ?? {
      query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma),
    }
  );
}

// Schemas
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const RecordTipBody = z.object({
  shiftDate: DateString,
  locationId: z.string().uuid().optional(),
  /** Total tips collected in agorot (e.g. ₪50.00 = 5000 agorot). */
  totalAgorot: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

const ListQuery = z.object({
  periodStart: DateString,
  periodEnd: DateString,
  locationId: z.string().uuid().optional(),
});

const PreviewQuery = z.object({
  shiftDate: DateString,
  totalAgorot: z.string().transform((v) => parseInt(v, 10)),
  locationId: z.string().uuid().optional(),
});

export async function tipsRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // -----------------------------------------------------------------------
  // POST /v1/tips — record tip pool + distributions
  // -----------------------------------------------------------------------
  app.post(
    '/tips',
    { schema: { body: RecordTipBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof RecordTipBody>;
      const organizationId = orgIdFor(req);
      const createdByUserId = userIdFor(req);

      const shiftDate = new Date(`${body.shiftDate}T12:00:00.000Z`);

      const pool = await dbFor(req).query((tx) =>
        recordTipPool(
          {
            organizationId,
            shiftDate,
            locationId: body.locationId,
            totalAgorot: body.totalAgorot,
            note: body.note,
            createdByUserId,
          },
          tx,
        ),
      );

      return reply.code(201).send(pool);
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/tips/preview — calculate without saving (for the UI)
  // -----------------------------------------------------------------------
  app.get(
    '/tips/preview',
    { schema: { querystring: PreviewQuery }, preHandler: authHandlers },
    async (req) => {
      const q = req.query as z.infer<typeof PreviewQuery>;
      const organizationId = orgIdFor(req);
      const shiftDate = new Date(`${q.shiftDate}T12:00:00.000Z`);

      const distributions = await dbFor(req).query((tx) =>
        calculateTipDistribution(
          {
            organizationId,
            shiftDate,
            locationId: q.locationId,
            totalAgorot: q.totalAgorot,
          },
          tx,
        ),
      );

      return { shiftDate: q.shiftDate, totalAgorot: q.totalAgorot, distributions };
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/tips — list pools by period
  // -----------------------------------------------------------------------
  app.get(
    '/tips',
    { schema: { querystring: ListQuery }, preHandler: authHandlers },
    async (req) => {
      const q = req.query as z.infer<typeof ListQuery>;
      const organizationId = orgIdFor(req);

      const start = new Date(`${q.periodStart}T00:00:00.000Z`);
      const end = new Date(`${q.periodEnd}T23:59:59.999Z`);

      const pools = await dbFor(req).query((tx) =>
        getTipPoolsForPeriod(
          {
            organizationId,
            periodStart: start,
            periodEnd: end,
            locationId: q.locationId,
          },
          tx,
        ),
      );

      return pools;
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/tips/:id — single pool
  // -----------------------------------------------------------------------
  app.get(
    '/tips/:id',
    {
      schema: { params: z.object({ id: z.string().uuid() }) },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const pool = await dbFor(req).query((tx) => getTipPool(id, tx));

      if (!pool) return reply.notFound('Tip pool not found');

      // Tenant isolation check
      const orgId = orgIdFor(req);
      if (pool.organizationId !== orgId && process.env['AUTH_DISABLED'] !== 'true') {
        return reply.forbidden();
      }

      return pool;
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /v1/tips/:id — delete pool (correction / undo)
  // -----------------------------------------------------------------------
  app.delete(
    '/tips/:id',
    {
      schema: { params: z.object({ id: z.string().uuid() }) },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = orgIdFor(req);

      // Verify ownership before deleting
      const pool = await dbFor(req).query((tx) => getTipPool(id, tx));
      if (!pool) return reply.notFound('Tip pool not found');
      if (pool.organizationId !== orgId && process.env['AUTH_DISABLED'] !== 'true') {
        return reply.forbidden();
      }

      await dbFor(req).query((tx) => deleteTipPool(id, tx));
      return reply.code(204).send();
    },
  );
}
