import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generatePayrollExport, toCsv, type PayrollFormat } from './payroll.service';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
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

const ExportQuery = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['standard', 'hilan']).default('standard'),
});

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  app.get(
    '/payroll/export.csv',
    { schema: { querystring: ExportQuery }, preHandler: authHandlers },
    async (req, reply) => {
      const { periodStart, periodEnd, format } = req.query as z.infer<
        typeof ExportQuery
      >;
      // periodEnd is treated as exclusive end-of-day → add 1 day so a request
      // for 2026-01-01..2026-01-31 includes shifts that start on the 31st.
      const start = new Date(`${periodStart}T00:00:00.000Z`);
      const endInclusive = new Date(`${periodEnd}T00:00:00.000Z`);
      const end = new Date(endInclusive.getTime() + 86400000);

      const result = await dbFor(req).query((tx) =>
        generatePayrollExport(
          {
            orgId: orgIdFor(req),
            periodStart: start,
            periodEnd: end,
            format: format as PayrollFormat,
          },
          tx,
        ),
      );

      const csv = toCsv(result.headers, result.rows);
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${result.filename}"`,
        );
      return reply.send(csv);
    },
  );
}
