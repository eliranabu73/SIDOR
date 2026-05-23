import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import type { PrismaClient } from '@prisma/client';
import { SCHEDULE_TEMPLATES, getTemplate } from './schedule-templates.js';
import { startOfWeek, addDays, format, parseISO, isValid } from 'date-fns';

/**
 * Build an org-scoped DB handle (see reads.routes.ts for rationale).
 * Falls back to direct prisma when AUTH_DISABLED skipped authenticate.
 */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

const ApplyBody = z.object({
  weekStart: z.string().optional(), // ISO date string, defaults to current week
});

const IdParam = z.object({ id: z.string().min(1) });

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  // GET /v1/templates — list all available templates
  app.get('/templates', async (_req, reply) => {
    return reply.send(
      SCHEDULE_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        emoji: t.emoji,
        industry: t.industry,
        roles: t.roles,
        weeklyHours: t.weeklyHours,
        color: t.color,
        shiftCount: t.shifts.reduce((sum, s) => sum + s.daysOfWeek.length, 0),
      })),
    );
  });

  // POST /v1/templates/:id/apply — create roles + shifts for this week
  app.post(
    '/templates/:id/apply',
    { schema: { params: IdParam, body: ApplyBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const { weekStart } = req.body as z.infer<typeof ApplyBody>;
      const orgId = orgIdFor(req);

      const tpl = getTemplate(id);
      if (!tpl) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });

      const db = dbFor(req);

      // Resolve week start date
      let weekStartDate: Date;
      if (weekStart) {
        const d = parseISO(weekStart);
        weekStartDate = isValid(d) ? d : startOfWeek(new Date(), { weekStartsOn: 0 });
      } else {
        weekStartDate = startOfWeek(new Date(), { weekStartsOn: 0 });
      }

      // Upsert roles
      const roleMap = new Map<string, string>(); // name → id
      for (const roleName of tpl.roles) {
        const role = await db.query((tx) =>
          tx.role.upsert({
            where: { organizationId_name: { organizationId: orgId, name: roleName } },
            create: { organizationId: orgId, name: roleName },
            update: {},
          }),
        );
        roleMap.set(roleName, role.id);
      }

      // Ensure a default location exists
      let location = await db.query((tx) =>
        tx.location.findFirst({ where: { organizationId: orgId } }),
      );
      if (!location) {
        location = await db.query((tx) =>
          tx.location.create({
            data: { organizationId: orgId, name: 'ראשי', timezone: 'Asia/Jerusalem' },
          }),
        );
      }

      // Ensure schedule exists for this week
      const weekKey = format(weekStartDate, 'yyyy-MM-dd');
      const periodStart = new Date(weekKey);
      const periodEnd = addDays(weekStartDate, 6);
      let schedule = await db.query((tx) =>
        tx.schedule.findFirst({
          where: { organizationId: orgId, periodStartDate: periodStart },
        }),
      );
      if (!schedule) {
        schedule = await db.query((tx) =>
          tx.schedule.create({
            data: {
              organizationId: orgId,
              locationId: location!.id,
              name: tpl.name,
              periodStartDate: periodStart,
              periodEndDate: periodEnd,
              timezone: 'Asia/Jerusalem',
              status: 'DRAFT',
            },
          }),
        );
      }

      // Create shifts
      let createdShifts = 0;
      for (const shiftDef of tpl.shifts) {
        const roleId = roleMap.get(shiftDef.role);
        if (!roleId) continue;

        for (const dow of shiftDef.daysOfWeek) {
          const shiftDate = addDays(weekStartDate, dow);
          const dateStr = format(shiftDate, 'yyyy-MM-dd');

          const startAtUtc = new Date(`${dateStr}T${shiftDef.startTime}:00`);
          // Handle overnight shifts (end < start means next day)
          const [endHH] = shiftDef.endTime.split(':').map(Number);
          const [startHH] = shiftDef.startTime.split(':').map(Number);
          const isOvernight = (endHH ?? 0) < (startHH ?? 0) || ((endHH ?? 0) === 0 && (startHH ?? 0) > 0);
          const endDateStr = isOvernight
            ? format(addDays(shiftDate, 1), 'yyyy-MM-dd')
            : dateStr;
          const endAtUtc = new Date(`${endDateStr}T${shiftDef.endTime}:00`);

          await db.query((tx) =>
            tx.shift.create({
              data: {
                organizationId: orgId,
                scheduleId: schedule!.id,
                locationId: location!.id,
                roleId,
                startAtUtc,
                endAtUtc,
                timezone: 'Asia/Jerusalem',
                localStartDate: shiftDate,
                localEndDate: isOvernight ? addDays(shiftDate, 1) : shiftDate,
                status: 'PLANNED',
                requiredEmployeeCount: 1,
              },
            }),
          );
          createdShifts++;
        }
      }

      // Update org industry
      await db.query((tx) =>
        tx.organization.update({
          where: { id: orgId },
          data: { industry: tpl.industry },
        }),
      );

      return reply.send({
        scheduleId: schedule.id,
        weekStart: weekKey,
        createdRoles: tpl.roles.length,
        createdShifts,
        template: tpl.name,
      });
    },
  );
}
