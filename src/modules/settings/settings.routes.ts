import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../shared/errors.js';
import {
  getOrgSettings,
  patchOrgSettings,
  updateRole,
  deleteRole,
  updateLocation,
  deleteLocation,
} from './settings.service.js';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

const IdParam = z.object({ id: z.string().uuid() });

const LaborRulesSchema = z.object({
  maxHoursDay: z.number().min(1).max(24).optional(),
  maxHoursWeek: z.number().min(1).max(168).optional(),
  minRestHours: z.number().min(0).max(24).optional(),
  shiftTypes: z.array(z.string().min(1).max(60)).optional(),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  roleRates: z.record(z.string(), z.number().min(0)).optional(),
});

const PatchOrgBody = z.object({
  name: z.string().min(2).max(200).optional(),
  industry: z.string().min(1).max(100).optional(),
  defaultTimezone: z.string().min(3).max(64).optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
  laborRules: LaborRulesSchema.optional(),
});

const UpdateRoleBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(200).nullable().optional(),
});

const UpdateLocationBody = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(3).max(64).nullable().optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  // GET /v1/settings — full org config
  app.get('/settings', { preHandler: authHandlers }, async (req, reply) => {
    try {
      return reply.send(await getOrgSettings(orgIdFor(req)));
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });

  // PATCH /v1/settings — update org profile + labor rules
  app.patch(
    '/settings',
    { schema: { body: PatchOrgBody }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const body = req.body as z.infer<typeof PatchOrgBody>;
        return reply.send(await patchOrgSettings(orgIdFor(req), body));
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // PATCH /v1/roles/:id
  app.patch(
    '/roles/:id',
    { schema: { params: IdParam, body: UpdateRoleBody }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        const { name, description } = req.body as z.infer<typeof UpdateRoleBody>;
        return reply.send(await updateRole(orgIdFor(req), id, name, description));
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // DELETE /v1/roles/:id
  app.delete(
    '/roles/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        await deleteRole(orgIdFor(req), id);
        return reply.code(204).send();
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // PATCH /v1/locations/:id
  app.patch(
    '/locations/:id',
    { schema: { params: IdParam, body: UpdateLocationBody }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        const { name, timezone } = req.body as z.infer<typeof UpdateLocationBody>;
        return reply.send(await updateLocation(orgIdFor(req), id, name, timezone));
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // DELETE /v1/locations/:id
  app.delete(
    '/locations/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        await deleteLocation(orgIdFor(req), id);
        return reply.code(204).send();
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
