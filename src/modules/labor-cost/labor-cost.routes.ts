import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fetchLaborCostForWeek } from './labor-cost.service';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}
/** RLS-aware DB handle (falls back to direct prisma in AUTH_DISABLED mode). */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const Query = z.object({ weekStart: z.string() });

export async function laborCostRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  app.get(
    '/labor-cost',
    { schema: { querystring: Query }, preHandler: authHandlers },
    async (req, reply) => {
      const { weekStart } = req.query as z.infer<typeof Query>;
      const res = await dbFor(req).query((tx) =>
        fetchLaborCostForWeek(
          {
            organizationId: orgIdFor(req),
            weekStart: new Date(weekStart),
          },
          tx,
        ),
      );
      return reply.send(res);
    },
  );
}
