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

function actingUserId(req: { headers: Record<string, unknown> }): string {
  const v = req.headers['x-user-id'];
  if (typeof v === 'string' && v.length > 0) return v;
  return '00000000-0000-0000-0000-0000000000aa';
}

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
  app.post(
    '/shifts/:shiftId/claims',
    { schema: { params: ShiftIdParam, body: ClaimCreateBody } },
    async (req, reply) => {
      const { shiftId } = req.params as z.infer<typeof ShiftIdParam>;
      const body = req.body as z.infer<typeof ClaimCreateBody>;
      try {
        const result = await claimOpenShift({
          shiftId,
          employeeId: body.employeeId,
          acknowledgeWarnings: body.acknowledgeWarnings ?? false,
          actingUserId: actingUserId(req),
        });
        return reply.code(201).send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/claims/:claimId/approve',
    { schema: { params: ClaimIdParam, body: ClaimApproveBody } },
    async (req, reply) => {
      const { claimId } = req.params as z.infer<typeof ClaimIdParam>;
      const body = req.body as z.infer<typeof ClaimApproveBody>;
      try {
        const result = await approveClaim({
          claimId,
          actingUserId: actingUserId(req),
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
    { schema: { params: ClaimIdParam, body: ClaimRejectBody } },
    async (req, reply) => {
      const { claimId } = req.params as z.infer<typeof ClaimIdParam>;
      const body = req.body as z.infer<typeof ClaimRejectBody>;
      try {
        const result = await rejectClaim({
          claimId,
          actingUserId: actingUserId(req),
          reason: body.reason,
        });
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );
}
