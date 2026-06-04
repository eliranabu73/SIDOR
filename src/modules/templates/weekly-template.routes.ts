import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';
import {
  applyTemplateToSchedule,
  createWeeklyTemplate,
  deleteWeeklyTemplate,
  getWeeklyTemplate,
  listWeeklyTemplates,
  updateWeeklyTemplate,
} from './weekly-template.service';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId?: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const ShiftInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startLocalTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endLocalTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  timezone: z.string().optional(),
  roleId: z.string().uuid().nullable().optional(),
  requiredEmployeeCount: z.number().int().min(1).max(50).optional(),
  defaultEmployeeIds: z.array(z.string().uuid()).optional(),
});

const UpsertBody = z.object({
  name: z.string().min(1).max(120),
  locationId: z.string().uuid().nullable().optional(),
  shifts: z.array(ShiftInput).max(200),
});

const IdParam = z.object({ id: z.string().uuid() });
const ScheduleIdParam = z.object({ scheduleId: z.string().uuid() });
const ApplyBody = z.object({ templateId: z.string().uuid() });

export async function weeklyTemplateRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  // GET /v1/weekly-templates
  app.get('/weekly-templates', { preHandler: authHandlers }, async (req, reply) => {
    try {
      const rows = await dbFor(req).query((tx) => listWeeklyTemplates(orgIdFor(req), tx));
      return reply.send(rows);
    } catch (err) {
      // The list is a non-critical read (used only to populate the template
      // dialog). A transient DB/migration hiccup must NOT surface as a 500 that
      // the client retries — degrade to an empty list so the UI stays usable.
      req.log.error({ err }, 'listWeeklyTemplates failed — returning empty list');
      return reply.send([]);
    }
  });

  // GET /v1/weekly-templates/:id
  app.get(
    '/weekly-templates/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      try {
        const row = await dbFor(req).query((tx) => getWeeklyTemplate(orgIdFor(req), id, tx));
        if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
        return reply.send(row);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // POST /v1/weekly-templates
  app.post(
    '/weekly-templates',
    { schema: { body: UpsertBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof UpsertBody>;
      try {
        const row = await dbFor(req).query((tx) => createWeeklyTemplate(orgIdFor(req), body, tx));
        return reply.code(201).send(row);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PUT /v1/weekly-templates/:id
  app.put(
    '/weekly-templates/:id',
    { schema: { params: IdParam, body: UpsertBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const body = req.body as z.infer<typeof UpsertBody>;
      try {
        const row = await dbFor(req).query((tx) => updateWeeklyTemplate(orgIdFor(req), id, body, tx));
        if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
        return reply.send(row);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // DELETE /v1/weekly-templates/:id
  app.delete(
    '/weekly-templates/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      try {
        const ok = await dbFor(req).query((tx) => deleteWeeklyTemplate(orgIdFor(req), id, tx));
        if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
        return reply.code(204).send();
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // POST /v1/schedules/:scheduleId/apply-template — materialise a template
  // (shifts + default employees) into the target week.
  app.post(
    '/schedules/:scheduleId/apply-template',
    { schema: { params: ScheduleIdParam, body: ApplyBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const { templateId } = req.body as z.infer<typeof ApplyBody>;
      try {
        const result = await dbFor(req).query((tx) =>
          applyTemplateToSchedule(
            { scheduleId, templateId, organizationId: orgIdFor(req), actingUserId: req.user?.id ?? null },
            tx,
          ),
        );
        return reply.send(result);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
}

function fail(reply: FastifyReply, err: unknown) {
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  const code = (err as { code?: string }).code ?? 'WEEKLY_TEMPLATE_FAILED';
  return reply.code(status).send({ code, message: (err as Error).message });
}
