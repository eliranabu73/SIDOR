import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fetchFairness } from './fairness.service';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

const Q = z.object({ weeks: z.coerce.number().int().min(1).max(13).optional() });

export async function fairnessRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  app.get(
    '/fairness',
    { schema: { querystring: Q }, preHandler: authHandlers },
    async (req, reply) => {
      const { weeks } = req.query as z.infer<typeof Q>;
      const data = await fetchFairness({
        organizationId: orgIdFor(req),
        weeks,
      });
      return reply.send(data);
    },
  );
}
