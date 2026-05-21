import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AssignmentBodySchema, ShiftIdParam } from './assignments.schemas.js';
import { applyAssignment, validateOnly } from './assignments.service.js';
import { HttpError } from '../../shared/errors.js';

/**
 * DEV-ONLY escape hatch.
 *
 * When NODE_ENV === 'development' AND AUTH_DISABLED === 'true', routes bypass
 * JWT verification and fall back to the `x-user-id` header (or a hardcoded
 * dummy UUID). This allows local smoke-testing without a valid Supabase token.
 *
 * SECURITY: this branch is never reachable in production because:
 *  1. NODE_ENV is forced to 'production' by the deployment pipeline.
 *  2. AUTH_DISABLED is not set in production env.
 *
 * DO NOT remove the NODE_ENV guard — AUTH_DISABLED alone is insufficient.
 */
function devActingUserId(req: { headers: Record<string, unknown> }): string {
  const v = req.headers['x-user-id'];
  if (typeof v === 'string' && v.length > 0) return v;
  return '00000000-0000-0000-0000-0000000000aa';
}

const AUTH_DISABLED =
  process.env['NODE_ENV'] === 'development' && process.env['AUTH_DISABLED'] === 'true';

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

      // req.user is guaranteed to be set by app.authenticate.
      // The fallback is only reached when AUTH_DISABLED (dev only).
      const actingUserId = AUTH_DISABLED ? devActingUserId(req) : req.user!.id;

      try {
        const result = await validateOnly({
          shiftId,
          employeeId: body.employeeId,
          expectedShiftVersion: body.expectedShiftVersion,
          action: body.action,
          actingUserId,
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

      const actingUserId = AUTH_DISABLED ? devActingUserId(req) : req.user!.id;

      try {
        const result = await applyAssignment({
          shiftId,
          employeeId: body.employeeId,
          expectedShiftVersion: body.expectedShiftVersion,
          expectedAssignmentVersion: body.expectedAssignmentVersion,
          action: body.action,
          acknowledgeWarnings: body.acknowledgeWarnings,
          actingUserId,
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
