import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../shared/errors.js';
import { cancelShift, createShift, updateShift } from './shifts-crud.service.js';
import { prisma } from '../../db/prisma.js';
import type { PrismaClient } from '@prisma/client';
import { isBranchManager } from '../../shared/location-scope.js';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
/** RLS-aware DB handle (falls back to direct prisma in AUTH_DISABLED mode). */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const CreateShiftBody = z.object({
  scheduleId: z.string().uuid(),
  locationId: z.string().uuid(),
  roleId: z.string().uuid(),
  startAtUtc: z.string().datetime(),
  endAtUtc: z.string().datetime(),
  requiredEmployeeCount: z.number().int().min(1).max(100).optional(),
  timezone: z.string().min(3).max(64).optional(),
});

const UpdateShiftBody = z.object({
  startAtUtc: z.string().datetime().optional(),
  endAtUtc: z.string().datetime().optional(),
  requiredEmployeeCount: z.number().int().min(1).max(100).optional(),
  locationId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function shiftsCrudRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  app.post(
    '/shifts',
    { schema: { body: CreateShiftBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CreateShiftBody>;
      // BRANCH_MANAGER may only create shifts inside their own branch.
      if (
        isBranchManager(req.user ?? { role: '' }) &&
        body.locationId !== req.user?.locationId
      ) {
        return reply.code(403).send({
          code: 'BRANCH_SCOPE_VIOLATION',
          message: 'Branch managers can only create shifts in their own branch',
        });
      }
      try {
        const result = await dbFor(req).query((tx) =>
          createShift(
            {
              orgId: orgIdFor(req),
              scheduleId: body.scheduleId,
              locationId: body.locationId,
              roleId: body.roleId,
              startAtUtc: new Date(body.startAtUtc),
              endAtUtc: new Date(body.endAtUtc),
              requiredEmployeeCount: body.requiredEmployeeCount,
              timezone: body.timezone,
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
    '/shifts/:id',
    { schema: { params: IdParam, body: UpdateShiftBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const body = req.body as z.infer<typeof UpdateShiftBody>;
      // Branch-manager guard: cannot move a shift out of (or into) another branch,
      // and cannot edit a shift not belonging to their branch.
      if (isBranchManager(req.user ?? { role: '' })) {
        const existing = await dbFor(req).query((tx) =>
          tx.shift.findFirst({ where: { id, organizationId: orgIdFor(req) }, select: { locationId: true } }),
        );
        if (!existing || existing.locationId !== req.user?.locationId) {
          return reply.code(403).send({
            code: 'BRANCH_SCOPE_VIOLATION',
            message: 'Shift does not belong to your branch',
          });
        }
        if (body.locationId && body.locationId !== req.user?.locationId) {
          return reply.code(403).send({
            code: 'BRANCH_SCOPE_VIOLATION',
            message: 'Cannot move shift to another branch',
          });
        }
      }
      try {
        const result = await dbFor(req).query((tx) =>
          updateShift(
            {
              orgId: orgIdFor(req),
              id,
              startAtUtc: body.startAtUtc ? new Date(body.startAtUtc) : undefined,
              endAtUtc: body.endAtUtc ? new Date(body.endAtUtc) : undefined,
              requiredEmployeeCount: body.requiredEmployeeCount,
              locationId: body.locationId,
              roleId: body.roleId,
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
    '/shifts/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      if (isBranchManager(req.user ?? { role: '' })) {
        const existing = await dbFor(req).query((tx) =>
          tx.shift.findFirst({ where: { id, organizationId: orgIdFor(req) }, select: { locationId: true } }),
        );
        if (!existing || existing.locationId !== req.user?.locationId) {
          return reply.code(403).send({
            code: 'BRANCH_SCOPE_VIOLATION',
            message: 'Shift does not belong to your branch',
          });
        }
      }
      try {
        const result = await dbFor(req).query((tx) => cancelShift(orgIdFor(req), id, tx));
        return reply.send(result);
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
