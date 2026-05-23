import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fetchFairness } from './fairness.service';
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

const Q = z.object({ weeks: z.coerce.number().int().min(1).max(13).optional() });

export async function fairnessRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  app.get(
    '/fairness',
    { schema: { querystring: Q }, preHandler: authHandlers },
    async (req, reply) => {
      const { weeks } = req.query as z.infer<typeof Q>;
      const data = await dbFor(req).query((tx) =>
        fetchFairness(
          {
            organizationId: orgIdFor(req),
            weeks,
          },
          tx,
        ),
      );
      return reply.send(data);
    },
  );
}
