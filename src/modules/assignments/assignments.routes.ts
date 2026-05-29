import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AssignmentBodySchema, ShiftIdParam } from './assignments.schemas.js';
import { applyAssignment, validateOnly } from './assignments.service.js';
import { HttpError } from '../../shared/errors.js';
import { prisma } from '../../db/prisma.js';
import type { PrismaClient } from '@prisma/client';
import { isBranchManager } from '../../shared/location-scope.js';

/**
 * Reject assignment ops when the BRANCH_MANAGER is acting on a shift outside
 * their branch. Returns the offending response, or null when the call is
 * allowed to proceed.
 */
async function enforceBranchScope(
  req: { user?: { role?: string; locationId?: string | null; orgId?: string } },
  shiftId: string,
  reply: import('fastify').FastifyReply,
): Promise<import('fastify').FastifyReply | null> {
  if (!isBranchManager({ role: req.user?.role ?? '', locationId: req.user?.locationId ?? null })) return null;
  const orgId = req.user?.orgId;
  if (!orgId) return null;
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, organizationId: orgId },
    select: { locationId: true },
  });
  if (!shift || shift.locationId !== req.user?.locationId) {
    return reply.code(403).send({
      code: 'BRANCH_SCOPE_VIOLATION',
      message: 'Shift does not belong to your branch',
    });
  }
  return null;
}

/** RLS-aware DB handle (falls back to direct prisma in AUTH_DISABLED mode). */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const AUTH_DISABLED =
  process.env['NODE_ENV'] !== 'production' && process.env['AUTH_DISABLED'] === 'true';

export async function assignmentsRoutes(app: FastifyInstance): Promise<void> {
  // Build the preHandler array once:
  //   - In production (and test): always [app.authenticate]
  //   - In dev with AUTH_DISABLED: empty array (x-user-id header fallback used)
  const authHandlers = AUTH_DISABLED ? [] : [app.authenticate];

  app.post(
    '/shifts/:shiftId/validate-assignment',
    {
      schema: {
        params: ShiftIdParam,
        body: AssignmentBodySchema.omit({ acknowledgeWarnings: true }),
      },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { shiftId } = req.params as z.infer<typeof ShiftIdParam>;
      const body = req.body as z.infer<typeof AssignmentBodySchema>;

      const actingUserId = req.user!.id;
      const organizationId = req.user?.orgId;

      const blocked = await enforceBranchScope(req, shiftId, reply);
      if (blocked) return blocked;

      try {
        const result = await dbFor(req).query((tx) =>
          validateOnly(
            {
              shiftId,
              employeeId: body.employeeId,
              expectedShiftVersion: body.expectedShiftVersion,
              action: body.action,
              actingUserId,
              organizationId,
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

  app.patch(
    '/shifts/:shiftId/assignments',
    {
      schema: {
        params: ShiftIdParam,
        body: AssignmentBodySchema,
      },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { shiftId } = req.params as z.infer<typeof ShiftIdParam>;
      const body = req.body as z.infer<typeof AssignmentBodySchema>;

      const actingUserId = req.user!.id;
      const organizationId = req.user?.orgId;

      const blocked = await enforceBranchScope(req, shiftId, reply);
      if (blocked) return blocked;

      try {
        const result = await dbFor(req).query((tx) =>
          applyAssignment(
            {
              shiftId,
              employeeId: body.employeeId,
              expectedShiftVersion: body.expectedShiftVersion,
              expectedAssignmentVersion: body.expectedAssignmentVersion,
              action: body.action,
              acknowledgeWarnings: body.acknowledgeWarnings,
              actingUserId,
              organizationId,
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
}

function handleHttpError(reply: import('fastify').FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({
      code: err.code,
      message: err.message,
      details: err.details ?? null,
    });
  }
  reply.log.error(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Internal error' });
}
