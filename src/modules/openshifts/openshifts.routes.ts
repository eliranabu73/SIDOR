import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ClaimApproveBody,
  ClaimCreateBody,
  ClaimIdParam,
  ClaimRejectBody,
  ShiftIdParam,
} from './openshifts.schemas';
import {
  approveClaim,
  claimOpenShift,
  rejectClaim,
} from './openshifts.service';
import { HttpError } from '../../shared/errors';

function handleHttpError(reply: FastifyReply, err: unknown) {
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

/**
 * Register with: `app.register(openShiftsRoutes, { prefix: '/v1' })`
 */
export async function openShiftsRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers =
    process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  app.post(
    '/shifts/:shiftId/claims',
    { schema: { params: ShiftIdParam, body: ClaimCreateBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { shiftId } = req.params as z.infer<typeof ShiftIdParam>;
      const body = req.body as z.infer<typeof ClaimCreateBody>;
      try {
        const result = await claimOpenShift({
          shiftId,
          employeeId: body.employeeId,
          acknowledgeWarnings: body.acknowledgeWarnings ?? false,
          actingUserId: req.user?.id ?? '00000000-0000-0000-0000-0000000000aa',
        });
        return reply.code(201).send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/claims/:claimId/approve',
    { schema: { params: ClaimIdParam, body: ClaimApproveBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { claimId } = req.params as z.infer<typeof ClaimIdParam>;
      const body = req.body as z.infer<typeof ClaimApproveBody>;
      try {
        const result = await approveClaim({
          claimId,
          actingUserId: req.user?.id ?? '00000000-0000-0000-0000-0000000000aa',
          expectedShiftVersion: body.expectedShiftVersion,
        });
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/claims/:claimId/reject',
    { schema: { params: ClaimIdParam, body: ClaimRejectBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { claimId } = req.params as z.infer<typeof ClaimIdParam>;
      const body = req.body as z.infer<typeof ClaimRejectBody>;
      try {
        const result = await rejectClaim({
          claimId,
          actingUserId: req.user?.id ?? '00000000-0000-0000-0000-0000000000aa',
          reason: body.reason,
        });
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );
}
