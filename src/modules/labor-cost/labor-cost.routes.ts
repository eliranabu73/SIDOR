import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fetchLaborCostForWeek } from './labor-cost.service';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

const Query = z.object({ weekStart: z.string() });

export async function laborCostRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  app.get(
    '/labor-cost',
    { schema: { querystring: Query }, preHandler: authHandlers },
    async (req, reply) => {
      const { weekStart } = req.query as z.infer<typeof Query>;
      const res = await fetchLaborCostForWeek({
        organizationId: orgIdFor(req),
        weekStart: new Date(weekStart),
      });
      return reply.send(res);
    },
  );
}
