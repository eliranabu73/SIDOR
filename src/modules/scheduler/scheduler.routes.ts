import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SchedulerService, type ProviderName } from './scheduler.service';
import { persistCandidates } from './candidate-generation.service';
import { computeWeeklyCost } from './labor-cost.service';
import { HttpError } from '../../shared/errors';
import { prisma, withOrgContext } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';
import { locationScope } from '../../shared/location-scope';

// ---------------------------------------------------------------------------
// In-memory rate limiter for expensive auto-schedule endpoint.
// Limit: 3 calls per 60 seconds per organization.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;
const autoScheduleCallLog = new Map<string, number[]>();

function checkAutoScheduleRateLimit(orgId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const calls = (autoScheduleCallLog.get(orgId) ?? []).filter((t) => t > cutoff);
  if (calls.length >= RATE_LIMIT_MAX) return false;
  calls.push(now);
  autoScheduleCallLog.set(orgId, calls);
  return true;
}

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId?: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

/** RLS-aware DB handle (falls back to direct prisma in AUTH_DISABLED mode). */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}


const ScheduleIdParam = z.object({ scheduleId: z.string().uuid() });

const ApplyProposalsBody = z.object({
  proposals: z.array(
    z.object({
      shiftId: z.string().uuid(),
      employeeId: z.string().uuid(),
      score: z.number().optional(),
      breakdown: z.unknown().optional(),
    }),
  ),
});

const AutoScheduleBody = z.object({
  provider: z.enum(['greedy', 'or-tools']).optional().default('greedy'),
  dryRun: z.boolean().optional().default(true),
  weights: z
    .object({
      availability: z.number().optional(),
      preference: z.number().optional(),
      fairness: z.number().optional(),
      weeklyHoursBalance: z.number().optional(),
      weekendBalance: z.number().optional(),
      nightBalance: z.number().optional(),
    })
    .partial()
    .optional(),
});

function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

const SchedulesListQuery = z.object({
  status: z.string().optional(),
});

export async function schedulerRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // GET /v1/schedules — list schedules for this org, scoped to location for BRANCH_MANAGER.
  app.get(
    '/schedules',
    { schema: { querystring: SchedulesListQuery }, preHandler: authHandlers },
    async (req, reply) => {
      const { status } = req.query as z.infer<typeof SchedulesListQuery>;
      const orgId = orgIdFor(req);
      const scope = locationScope(req.user ?? { role: '' });
      try {
        const rows = await dbFor(req).query((tx) =>
          tx.schedule.findMany({
            where: {
              organizationId: orgId,
              ...(status ? { status: status.toUpperCase() as never } : {}),
              ...scope,
            },
            orderBy: { periodStartDate: 'desc' },
            select: {
              id: true,
              name: true,
              locationId: true,
              periodStartDate: true,
              periodEndDate: true,
              status: true,
              publishedAt: true,
              createdAt: true,
            },
          }),
        );
        return reply.send(rows);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/schedules/:scheduleId/apply-proposals',
    {
      schema: { params: ScheduleIdParam, body: ApplyProposalsBody },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const body = req.body as z.infer<typeof ApplyProposalsBody>;
      const actingUserId = req.user!.id;

      try {
        // The service runs each applyAssignment inside its own short
        // RLS-scoped tx and parallelises them with Promise.all, so the
        // outer route uses raw prisma (no big wrapping tx that would
        // exceed Accelerate's 15 s cap or the Vercel function timeout).
        const svc = new SchedulerService(prisma);
        const result = await svc.applyProposals(scheduleId, body.proposals, actingUserId, req.user?.orgId);
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/schedules/:scheduleId/publish',
    {
      schema: { params: ScheduleIdParam },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const actingUserId = req.user!.id;

      try {
        const updated = await dbFor(req).query((tx) => {
          const svc = new SchedulerService(tx);
          return svc.publishSchedule(scheduleId, actingUserId);
        });
        return reply.send(updated);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.get(
    '/schedules/:scheduleId/labor-cost',
    {
      schema: { params: ScheduleIdParam },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      try {
        const report = await dbFor(req).query((tx) =>
          computeWeeklyCost(
            { organizationId: orgIdFor(req), scheduleId },
            tx,
          ),
        );
        if (!report) {
          return reply.send(null);
        }
        return reply.send(report);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.get(
    '/schedules/:scheduleId/compliance',
    {
      schema: { params: ScheduleIdParam },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      try {
        const orgId = orgIdFor(req);
        const violations = await dbFor(req).query((tx) =>
          tx.ruleViolation.findMany({
            where: { organizationId: orgId, scheduleId, isResolved: false },
            select: {
              id: true,
              ruleCode: true,
              severity: true,
              message: true,
              shiftId: true,
              employeeId: true,
              detectedAt: true,
            },
            orderBy: { detectedAt: 'desc' },
          }),
        );
        return reply.send({ scheduleId, violations, count: violations.length });
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/schedules/:scheduleId/auto-schedule',
    {
      schema: { params: ScheduleIdParam, body: AutoScheduleBody },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const body = req.body as z.infer<typeof AutoScheduleBody>;
      const orgId = orgIdFor(req);

      // Rate-limit: max 3 auto-schedule calls per minute per org.
      if (!checkAutoScheduleRateLimit(orgId)) {
        return reply.code(429).send({
          code: 'RATE_LIMITED',
          message: 'חרגת ממגבלת הקצב — ניתן להפעיל שיבוץ אוטומטי עד 3 פעמים בדקה. נסה שוב בעוד רגע.',
        });
      }

      try {
        // Transaction 1 (reads + CPU): fetch data, generate + score candidates.
        // Always runs as dryRun=true to avoid calling persistCandidates inside
        // the transaction — that would exceed the Prisma Accelerate 15s cap.
        const result = await dbFor(req).query(async (tx) => {
          const schedCheck = await tx.schedule.findFirst({
            where: { id: scheduleId, organizationId: orgId },
            select: { id: true },
          });
          if (!schedCheck) {
            throw Object.assign(new Error('Schedule not found'), { statusCode: 404, code: 'NOT_FOUND' });
          }

          const svc = new SchedulerService(tx);
          return svc.run(
            { scheduleId, dryRun: true, weights: body.weights },
            body.provider as ProviderName,
            orgId,
          );
        });

        // Transaction 2 (writes): persist candidates in a separate short transaction.
        if (!body.dryRun && result._candidateRows.length > 0) {
          await withOrgContext(orgId).query((tx) =>
            persistCandidates(result._candidateRows, tx),
          );
        }

        const { _candidateRows: _, ...publicResult } = result;
        return reply.send(publicResult);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // MANAGER — per-employee confirmation status for a published schedule.
  // GET /v1/schedules/:scheduleId/confirmations
  app.get(
    '/schedules/:scheduleId/confirmations',
    {
      schema: { params: ScheduleIdParam },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const orgId = orgIdFor(req);

      try {
        const assignments = await dbFor(req).query((tx) =>
          tx.shiftAssignment.findMany({
            where: {
              shift: { scheduleId, organizationId: orgId, status: { not: 'CANCELLED' } },
              assignmentStatus: { not: 'CANCELLED' },
            },
            select: {
              id: true,
              employeeId: true,
              confirmedAt: true,
              confirmedVia: true,
              employee: { select: { fullName: true, phone: true } },
              shift: { select: { id: true, startAtUtc: true } },
            },
            orderBy: { employee: { fullName: 'asc' } },
          }),
        );

        // Group by employee
        type EmployeeEntry = {
          employeeId: string;
          fullName: string;
          phone: string | null;
          confirmedAt: string | null;
          confirmedVia: string | null;
          shiftCount: number;
          confirmedShiftCount: number;
        };
        const byEmployee = new Map<string, EmployeeEntry>();

        for (const a of assignments) {
          const existing = byEmployee.get(a.employeeId);
          // earliest confirmedAt wins for the "employee confirmed at" display
          const confirmedAt = a.confirmedAt
            ? a.confirmedAt.toISOString()
            : null;
          if (!existing) {
            byEmployee.set(a.employeeId, {
              employeeId: a.employeeId,
              fullName: a.employee.fullName,
              phone: a.employee.phone,
              confirmedAt,
              confirmedVia: a.confirmedVia,
              shiftCount: 1,
              confirmedShiftCount: a.confirmedAt ? 1 : 0,
            });
          } else {
            existing.shiftCount += 1;
            if (a.confirmedAt) {
              existing.confirmedShiftCount += 1;
              // keep earliest confirmedAt
              if (!existing.confirmedAt || a.confirmedAt.toISOString() < existing.confirmedAt) {
                existing.confirmedAt = a.confirmedAt.toISOString();
                existing.confirmedVia = a.confirmedVia;
              }
            }
          }
        }

        const employees = Array.from(byEmployee.values());
        const confirmed = employees.filter((e) => e.confirmedAt !== null).length;

        return reply.send({
          total: employees.length,
          confirmed,
          pending: employees.length - confirmed,
          employees,
        });
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );
}

function handleHttpError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply
      .code(err.statusCode)
      .send({ code: err.code, message: err.message, details: err.details ?? null });
  }
  // Custom errors thrown inside dbFor transactions
  if (err instanceof Error && 'statusCode' in err) {
    const e = err as Error & { statusCode: number; code: string };
    return reply.code(e.statusCode).send({ code: e.code, message: e.message });
  }
  reply.log.error(err);
  const _d = err instanceof Error ? err.message.slice(0, 300) : String(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Internal error', _d });
}
