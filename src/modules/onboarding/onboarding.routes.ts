/**
 * Onboarding routes — /v1/me + /v1/orgs.
 *
 * /v1/me is callable by any authenticated user (no membership required).
 * /v1/orgs creates an Org+Location+Schedule+Membership; the caller becomes OWNER.
 *
 * Both routes use the live JWT — the dev-only `AUTH_DISABLED` escape hatch is
 * NOT honoured here because onboarding fundamentally needs a real user id.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOrgForUser, listMemberships } from './onboarding.service.js';

const CreateOrgBody = z.object({
  name: z.string().min(2).max(120),
  defaultTimezone: z.string().min(3).max(64).optional(),
  industry: z.string().max(40).optional(),
  defaultLocationName: z.string().min(1).max(80).optional(),
});

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (req) => {
      const u = req.user!;
      const memberships = await listMemberships(u.id);
      const activeOrgId =
        memberships.find((m) => m.orgId === u.orgId)?.orgId ?? memberships[0]?.orgId ?? null;
      return {
        user: { id: u.id, role: u.role },
        memberships,
        activeOrgId,
      };
    },
  );

  app.post(
    '/orgs',
    {
      preHandler: [app.authenticate],
      schema: { body: CreateOrgBody },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CreateOrgBody>;
      const u = req.user!;
      const result = await createOrgForUser({
        userId: u.id,
        name: body.name,
        defaultTimezone: body.defaultTimezone,
        industry: body.industry,
        defaultLocationName: body.defaultLocationName,
      });
      return reply.code(201).send(result);
    },
  );
}
