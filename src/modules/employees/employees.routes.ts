import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../shared/errors.js';
import {
  createEmployee,
  createLocation,
  createRole,
  listLocations,
  listRoles,
  softDeleteEmployee,
  updateEmployee,
} from './employees.service.js';
import {
  getPreferences,
  listAvailability,
  replaceAvailabilityForManager,
  upsertPreferences,
  type PreferencesPayload,
} from './availability.service.js';
import { prisma } from '../../db/prisma.js';
import type { PrismaClient } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
/** RLS-aware DB handle (falls back to direct prisma in AUTH_DISABLED mode). */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const EmploymentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'INTERN',
]);

const CreateEmployeeBody = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  employmentType: EmploymentTypeEnum.optional(),
  roleIds: z.array(z.string().uuid()).optional(),
  defaultLocationId: z.string().uuid().optional(),
});

const UpdateEmployeeBody = z.object({
  fullName: z.string().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  employmentType: EmploymentTypeEnum.optional(),
  roleIds: z.array(z.string().uuid()).optional(),
  defaultLocationId: z.string().uuid().nullable().optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

const CreateRoleBody = z.object({ name: z.string().min(1).max(80) });
const CreateLocationBody = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(3).max(64).optional(),
});

export async function employeesRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  app.post(
    '/employees',
    { schema: { body: CreateEmployeeBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CreateEmployeeBody>;
      try {
        const result = await dbFor(req).query((tx) =>
          createEmployee(
            {
              orgId: orgIdFor(req),
              fullName: body.fullName,
              email: body.email,
              phone: body.phone,
              employmentType: body.employmentType,
              roleIds: body.roleIds,
              defaultLocationId: body.defaultLocationId,
            },
            tx,
          ),
        );
        return reply.code(201).send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.patch(
    '/employees/:id',
    { schema: { params: IdParam, body: UpdateEmployeeBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const body = req.body as z.infer<typeof UpdateEmployeeBody>;
      try {
        const result = await dbFor(req).query((tx) =>
          updateEmployee(
            {
              orgId: orgIdFor(req),
              id,
              fullName: body.fullName,
              email: body.email,
              phone: body.phone,
              employmentType: body.employmentType,
              roleIds: body.roleIds,
              defaultLocationId: body.defaultLocationId,
            },
            tx,
          ),
        );
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.delete(
    '/employees/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      try {
        const result = await dbFor(req).query((tx) =>
          softDeleteEmployee(orgIdFor(req), id, tx),
        );
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.get('/locations', { preHandler: authHandlers }, async (req, reply) => {
    try {
      const rows = await dbFor(req).query((tx) => listLocations(orgIdFor(req), tx));
      return reply.send(rows);
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });

  app.get('/roles', { preHandler: authHandlers }, async (req, reply) => {
    try {
      const rows = await dbFor(req).query((tx) => listRoles(orgIdFor(req), tx));
      return reply.send(rows);
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });

  app.post(
    '/roles',
    { schema: { body: CreateRoleBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CreateRoleBody>;
      try {
        const row = await dbFor(req).query((tx) => createRole(orgIdFor(req), body.name, tx));
        return reply.code(201).send(row);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // ---- Availability + preferences (manager-side, org-scoped) ----

  const TimeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'expected HH:mm or HH:mm:ss');
  const AvailabilityRuleSchema = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startLocalTime: TimeStr,
    endLocalTime: TimeStr,
    availabilityType: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PREFERRED']),
  });
  const PutAvailabilityBody = z.object({
    rules: z.array(AvailabilityRuleSchema).max(500),
  });

  app.get(
    '/employees/:id/availability',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      try {
        const out = await dbFor(req).query((tx) =>
          listAvailability(orgIdFor(req), id, tx),
        );
        return reply.send(out);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.put(
    '/employees/:id/availability',
    { schema: { params: IdParam, body: PutAvailabilityBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const body = req.body as z.infer<typeof PutAvailabilityBody>;
      // Normalize "HH:mm" → "HH:mm:00" so Postgres TIME accepts it.
      const rules = body.rules.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startLocalTime: r.startLocalTime.length === 5 ? `${r.startLocalTime}:00` : r.startLocalTime,
        endLocalTime: r.endLocalTime.length === 5 ? `${r.endLocalTime}:00` : r.endLocalTime,
        availabilityType: r.availabilityType,
      }));
      try {
        const out = await dbFor(req).query((tx) =>
          replaceAvailabilityForManager(orgIdFor(req), id, rules, tx),
        );
        return reply.send(out);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  const PreferencesBody = z.object({
    maxHoursPerWeek: z.number().int().min(0).max(168).nullable().optional(),
    preferredHoursPerWeek: z.number().int().min(0).max(168).nullable().optional(),
    minShiftsPerWeek: z.number().int().min(0).max(14).nullable().optional(),
    maxShiftsPerWeek: z.number().int().min(0).max(14).nullable().optional(),
    preferredShiftsPerWeek: z.number().int().min(0).max(14).nullable().optional(),
    prefersMornings: z.boolean().optional(),
    prefersEvenings: z.boolean().optional(),
    prefersWeekends: z.boolean().optional(),
    avoidBackToBackShifts: z.boolean().optional(),
    preferredShiftLength: z.number().int().min(0).max(24).nullable().optional(),
    noWorkAfter: TimeStr.nullable().optional(),
    noWorkBefore: TimeStr.nullable().optional(),
    avoidWeekends: z.boolean().optional(),
    avoidNightShifts: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  });

  app.get(
    '/employees/:id/preferences',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      try {
        const out = await dbFor(req).query((tx) =>
          getPreferences(orgIdFor(req), id, tx),
        );
        return reply.send(out);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.put(
    '/employees/:id/preferences',
    { schema: { params: IdParam, body: PreferencesBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const body = req.body as PreferencesPayload;
      try {
        const out = await dbFor(req).query((tx) =>
          upsertPreferences(orgIdFor(req), id, body, tx),
        );
        return reply.send(out);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/locations',
    { schema: { body: CreateLocationBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CreateLocationBody>;
      try {
        const row = await dbFor(req).query((tx) =>
          createLocation(orgIdFor(req), body.name, body.timezone, tx),
        );
        return reply.code(201).send(row);
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
