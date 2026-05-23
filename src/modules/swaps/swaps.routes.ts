import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  SwapApproveBody,
  SwapCreateBody,
  SwapIdParam,
  SwapRejectBody,
} from './swaps.schemas';
import { approveSwap, createSwap, rejectSwap } from './swaps.service';
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
 * Register with: `app.register(swapsRoutes, { prefix: '/v1' })`
 */
export async function swapsRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers =
    process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  app.post(
    '/swaps',
    { schema: { body: SwapCreateBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof SwapCreateBody>;
      try {
        const result = await createSwap({
          sourceAssignmentId: body.sourceAssignmentId,
          requestingEmployeeId: body.requestingEmployeeId,
          targetEmployeeId: body.targetEmployeeId ?? null,
          actingUserId: req.user?.id ?? '00000000-0000-0000-0000-0000000000aa',
        });
        return reply.code(201).send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/swaps/:swapId/approve',
    { schema: { params: SwapIdParam, body: SwapApproveBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { swapId } = req.params as z.infer<typeof SwapIdParam>;
      const body = req.body as z.infer<typeof SwapApproveBody>;
      try {
        const result = await approveSwap({
          swapId,
          actingUserId: req.user?.id ?? '00000000-0000-0000-0000-0000000000aa',
          approvingEmployeeId: body.approvingEmployeeId,
          asManager: body.asManager ?? false,
        });
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/swaps/:swapId/reject',
    { schema: { params: SwapIdParam, body: SwapRejectBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { swapId } = req.params as z.infer<typeof SwapIdParam>;
      const body = req.body as z.infer<typeof SwapRejectBody>;
      try {
        const result = await rejectSwap({
          swapId,
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
