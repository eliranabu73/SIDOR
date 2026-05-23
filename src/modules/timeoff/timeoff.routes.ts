import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string; sub?: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function userIdFor(req: { user?: { id?: string } }): string | null {
  return req.user?.id ?? null;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}
function dbFor(req: {
  orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> };
}) {
  return (
    req.orgPrisma ?? {
      query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma),
    }
  );
}

const ListQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function timeoffRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // Manager inbox: list time-off requests for the org's employees.
  app.get(
    '/timeoff',
    { schema: { querystring: ListQuery }, preHandler: authHandlers },
    async (req, reply) => {
      const { status } = req.query as z.infer<typeof ListQuery>;
      const orgId = orgIdFor(req);
      const rows = await dbFor(req).query((tx) =>
        tx.employeeTimeOffRequest.findMany({
          where: {
            employee: { organizationId: orgId },
            ...(status ? { status } : {}),
          },
          include: { employee: { select: { id: true, fullName: true } } },
          orderBy: [{ status: 'asc' }, { startAtUtc: 'asc' }],
          take: 200,
        }),
      );
      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          employeeId: r.employeeId,
          employeeName: r.employee.fullName,
          startAtUtc: r.startAtUtc.toISOString(),
          endAtUtc: r.endAtUtc.toISOString(),
          timezone: r.timezone,
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );

  app.post(
    '/timeoff/:id/approve',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const orgId = orgIdFor(req);
      const userId = userIdFor(req);
      const updated = await dbFor(req).query(async (tx) => {
        const row = await tx.employeeTimeOffRequest.findUnique({
          where: { id },
          include: { employee: { select: { organizationId: true } } },
        });
        if (!row || row.employee.organizationId !== orgId) return null;
        return tx.employeeTimeOffRequest.update({
          where: { id },
          data: { status: 'APPROVED', approvedByUserId: userId },
        });
      });
      if (!updated) return reply.status(404).send({ message: 'Not found' });
      return reply.send({ id: updated.id, status: updated.status });
    },
  );

  app.post(
    '/timeoff/:id/reject',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const orgId = orgIdFor(req);
      const userId = userIdFor(req);
      const updated = await dbFor(req).query(async (tx) => {
        const row = await tx.employeeTimeOffRequest.findUnique({
          where: { id },
          include: { employee: { select: { organizationId: true } } },
        });
        if (!row || row.employee.organizationId !== orgId) return null;
        return tx.employeeTimeOffRequest.update({
          where: { id },
          data: { status: 'REJECTED', approvedByUserId: userId },
        });
      });
      if (!updated) return reply.status(404).send({ message: 'Not found' });
      return reply.send({ id: updated.id, status: updated.status });
    },
  );
}
