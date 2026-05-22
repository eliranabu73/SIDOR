import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  approveSwap,
  createSwapRequest,
  listPendingSwaps,
  rejectSwap,
  suggestSwapCandidates,
} from './swaps-marketplace.service';
import { verifyEmployeeToken } from '../share/share.service';
import { prisma } from '../../db/prisma';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string; id?: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

const TokenSwapBody = z.object({
  assignmentId: z.string().uuid(),
});
const TokenParam = z.object({ token: z.string().min(8) });
const SwapIdParam = z.object({ id: z.string().uuid() });
const ApproveBody = z.object({ targetEmployeeId: z.string().uuid() });

export async function swapsMarketplaceRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // PUBLIC — employee initiates a swap via their share token
  app.post(
    '/v1/share/:token/swap-request',
    { schema: { params: TokenParam, body: TokenSwapBody } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const { assignmentId } = req.body as z.infer<typeof TokenSwapBody>;
      const decoded = verifyEmployeeToken(token);
      if (!decoded) return reply.code(401).send({ code: 'INVALID_TOKEN' });
      try {
        const r = await createSwapRequest({
          organizationId: decoded.organizationId,
          requestingEmployeeId: decoded.employeeId,
          sourceAssignmentId: assignmentId,
        });
        return reply.code(201).send({
          id: r.id,
          status: r.status.toLowerCase(),
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'SWAP_FAILED', message: (err as Error).message });
      }
    },
  );

  // MANAGER — list pending swaps
  app.get(
    '/v1/swap-requests',
    { preHandler: authHandlers },
    async (req, reply) => {
      const data = await listPendingSwaps(orgIdFor(req));
      return reply.send(data);
    },
  );

  // MANAGER — get candidate employees for a swap
  app.get(
    '/v1/swap-requests/:id/candidates',
    { schema: { params: SwapIdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof SwapIdParam>;
      // Look up the assignment id from the swap
      const swap = await prisma.shiftSwapRequest.findFirst({
        where: { id, organizationId: orgIdFor(req) },
        select: { sourceAssignmentId: true },
      });
      if (!swap) return reply.code(404).send({ code: 'NOT_FOUND' });
      const candidates = await suggestSwapCandidates({
        organizationId: orgIdFor(req),
        sourceAssignmentId: swap.sourceAssignmentId,
      });
      return reply.send(candidates);
    },
  );

  // MANAGER — approve
  app.post(
    '/v1/swap-requests/:id/approve',
    { schema: { params: SwapIdParam, body: ApproveBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof SwapIdParam>;
      const { targetEmployeeId } = req.body as z.infer<typeof ApproveBody>;
      try {
        const result = await approveSwap({
          organizationId: orgIdFor(req),
          swapId: id,
          targetEmployeeId,
          managerUserId: req.user?.id ?? null,
        });
        return reply.send({ id: result.id, status: result.status.toLowerCase() });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'APPROVE_FAILED', message: (err as Error).message });
      }
    },
  );

  // MANAGER — reject
  app.post(
    '/v1/swap-requests/:id/reject',
    { schema: { params: SwapIdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof SwapIdParam>;
      try {
        const result = await rejectSwap({
          organizationId: orgIdFor(req),
          swapId: id,
        });
        return reply.send({ id: result.id, status: result.status.toLowerCase() });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'REJECT_FAILED', message: (err as Error).message });
      }
    },
  );
}
