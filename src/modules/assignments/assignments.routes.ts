import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AssignmentBodySchema, ShiftIdParam } from './assignments.schemas';
import { applyAssignment, validateOnly } from './assignments.service';
import { HttpError } from '../../shared/errors';

function actingUserId(req: { headers: Record<string, unknown> }): string {
  const v = req.headers['x-user-id'];
  if (typeof v === 'string' && v.length > 0) return v;
  // dev fallback — replaced by real auth later
  return '00000000-0000-0000-0000-0000000000aa';
}

export async function assignmentsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/shifts/:shiftId/validate-assignment',
    {
      schema: {
        params: ShiftIdParam,
        body: AssignmentBodySchema.omit({ acknowledgeWarnings: true }),
      },
    },
    async (req, reply) => {
      const { shiftId } = req.params as z.infer<typeof ShiftIdParam>;
      const body = req.body as z.infer<typeof AssignmentBodySchema>;
      try {
        const result = await validateOnly({
          shiftId,
          employeeId: body.employeeId,
          expectedShiftVersion: body.expectedShiftVersion,
          action: body.action,
          actingUserId: actingUserId(req),
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
    },
    async (req, reply) => {
      const { shiftId } = req.params as z.infer<typeof ShiftIdParam>;
      const body = req.body as z.infer<typeof AssignmentBodySchema>;
      try {
        const result = await applyAssignment({
          shiftId,
          employeeId: body.employeeId,
          expectedShiftVersion: body.expectedShiftVersion,
          expectedAssignmentVersion: body.expectedAssignmentVersion,
          action: body.action,
          acknowledgeWarnings: body.acknowledgeWarnings,
          actingUserId: actingUserId(req),
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
