import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AssignmentBodySchema, ShiftIdParam } from './assignments.schemas.js';
import { applyAssignment, validateOnly } from './assignments.service.js';
import { HttpError } from '../../shared/errors.js';

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

      try {
        const result = await validateOnly({
          shiftId,
          employeeId: body.employeeId,
          expectedShiftVersion: body.expectedShiftVersion,
          action: body.action,
          actingUserId,
          organizationId,
        });
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

      try {
        const result = await applyAssignment({
          shiftId,
          employeeId: body.employeeId,
          expectedShiftVersion: body.expectedShiftVersion,
          expectedAssignmentVersion: body.expectedAssignmentVersion,
          action: body.action,
          acknowledgeWarnings: body.acknowledgeWarnings,
          actingUserId,
          organizationId,
        });
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
