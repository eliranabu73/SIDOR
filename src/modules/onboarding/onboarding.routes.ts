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
import { quickBootstrap } from './quick-bootstrap.service.js';
import { prisma, withOrgContext, withAdminContext } from '../../db/prisma.js';

const CreateOrgBody = z.object({
  name: z.string().min(2).max(120),
  defaultTimezone: z.string().min(3).max(64).optional(),
  industry: z.string().max(40).optional(),
  defaultLocationName: z.string().min(1).max(80).optional(),
});

const QuickBootstrapBody = z.object({
  name: z.string().min(2).max(120),
  industry: z.string().min(1).max(40),
  employeeCount: z.number().int().min(1).max(200),
});

const OrgIdParam = z.object({ id: z.string().uuid() });

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (req) => {
      const u = req.user!;
      // Use admin context to bypass RLS — /v1/me is a cross-tenant discovery
      // endpoint (user doesn't know their orgId yet, so no context to set).
      const adminDb = withAdminContext();
      const memberships = await adminDb.query((tx) => listMemberships(u.id, tx));
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

  // POST /v1/onboarding/quick-bootstrap — 60-second Aha flow.
  app.post(
    '/onboarding/quick-bootstrap',
    {
      preHandler: [app.authenticate],
      schema: { body: QuickBootstrapBody },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof QuickBootstrapBody>;
      const u = req.user!;
      const result = await quickBootstrap({
        userId: u.id,
        name: body.name,
        industry: body.industry,
        employeeCount: body.employeeCount,
      });
      return reply.code(201).send(result);
    },
  );

  // GET /v1/orgs/:id/onboarding-status — used by the quick-schedule landing
  // page to know when the bootstrap transaction has finished materialising
  // shifts. Naive: any shift in the org means we're done.
  app.get(
    '/orgs/:id/onboarding-status',
    {
      preHandler: [app.authenticate],
      schema: { params: OrgIdParam },
    },
    async (req) => {
      const { id } = req.params as z.infer<typeof OrgIdParam>;
      const db = withOrgContext(id);
      const shift = await db.query((tx) =>
        tx.shift.findFirst({
          where: { organizationId: id },
          select: { scheduleId: true },
          orderBy: { createdAt: 'asc' },
        }),
      );
      if (!shift) return { ready: false };
      return { ready: true, scheduleId: shift.scheduleId ?? undefined };
    },
  );
}
