import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  buildPublishBundle,
  fetchEmployeeView,
  verifyEmployeeToken,
} from './share.service';
import {
  createTimeOffRequest,
  fetchEmployeeActivity,
  replaceAvailability,
} from './share-actions.service';
import { loadScheduleExportData } from './export/data';
import { renderPng } from './export/png-renderer';
import { renderPdf } from './export/pdf-renderer';
import { isExportStyle, type ExportStyle } from './export/types';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

const SchedulePublishParam = z.object({ scheduleId: z.string() });
const TokenParam = z.object({ token: z.string().min(8) });

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // Manager-only: build a publish bundle with WA links per employee.
  app.post(
    '/v1/schedules/:scheduleId/publish-message',
    { schema: { params: SchedulePublishParam }, preHandler: authHandlers },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof SchedulePublishParam>;
      try {
        const bundle = await buildPublishBundle({
          scheduleId,
          organizationId: orgIdFor(req),
        });
        return reply.send(bundle);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'PUBLISH_FAILED', message: (err as Error).message });
      }
    },
  );

  // PUBLIC — employee activity (time-off + availability) via share token.
  app.get(
    '/v1/share/:token/activity',
    { schema: { params: TokenParam } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const decoded = verifyEmployeeToken(token);
      if (!decoded) return reply.code(401).send({ code: 'INVALID_TOKEN' });
      const data = await fetchEmployeeActivity({
        employeeId: decoded.employeeId,
        organizationId: decoded.organizationId,
      });
      return reply.send(data);
    },
  );

  // PUBLIC — employee creates a time-off request.
  const TimeOffBody = z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().max(280).optional(),
  });
  app.post(
    '/v1/share/:token/time-off',
    { schema: { params: TokenParam, body: TimeOffBody } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const body = req.body as z.infer<typeof TimeOffBody>;
      const decoded = verifyEmployeeToken(token);
      if (!decoded) return reply.code(401).send({ code: 'INVALID_TOKEN' });
      try {
        const r = await createTimeOffRequest({
          employeeId: decoded.employeeId,
          organizationId: decoded.organizationId,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          reason: body.reason,
        });
        return reply.code(201).send({
          id: r.id,
          status: r.status.toLowerCase(),
          startsAt: r.startAtUtc.toISOString(),
          endsAt: r.endAtUtc.toISOString(),
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'TIMEOFF_FAILED', message: (err as Error).message });
      }
    },
  );

  // PUBLIC — replace weekly availability.
  const AvailabilityBody = z.object({
    rules: z.array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startLocalTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endLocalTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        type: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PREFERRED']),
      }),
    ),
  });
  app.put(
    '/v1/share/:token/availability',
    { schema: { params: TokenParam, body: AvailabilityBody } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const body = req.body as z.infer<typeof AvailabilityBody>;
      const decoded = verifyEmployeeToken(token);
      if (!decoded) return reply.code(401).send({ code: 'INVALID_TOKEN' });
      try {
        const rules = await replaceAvailability({
          employeeId: decoded.employeeId,
          organizationId: decoded.organizationId,
          rules: body.rules,
        });
        return reply.send({
          rules: rules.map((r) => ({
            id: r.id,
            dayOfWeek: r.dayOfWeek,
            startLocalTime: r.startLocalTime,
            endLocalTime: r.endLocalTime,
            type: r.availabilityType.toLowerCase(),
          })),
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'AVAIL_FAILED', message: (err as Error).message });
      }
    },
  );

  // MANAGER: download a styled PNG/PDF of a schedule for WhatsApp/email share.
  // Auth-optional: falls back to DEMO_ORG_ID (and demo fixture if not found).
  const ExportParams = z.object({ scheduleId: z.string() });
  const ExportQuery = z.object({ style: z.string().optional() });

  function parseStyle(v: unknown): ExportStyle {
    return isExportStyle(v) ? v : 'branded';
  }

  app.get(
    '/v1/schedules/:scheduleId/export.png',
    { schema: { params: ExportParams, querystring: ExportQuery } },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ExportParams>;
      const { style } = req.query as z.infer<typeof ExportQuery>;
      const chosen = parseStyle(style);
      try {
        const data = await loadScheduleExportData(scheduleId, orgIdFor(req));
        const buf = await renderPng(data, chosen);
        return reply
          .header('content-type', 'image/png')
          .header(
            'content-disposition',
            `attachment; filename="schedule-${data.weekStart}-${chosen}.png"`,
          )
          .header('cache-control', 'private, max-age=60')
          .send(buf);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'EXPORT_FAILED', message: (err as Error).message });
      }
    },
  );

  app.get(
    '/v1/schedules/:scheduleId/export.pdf',
    { schema: { params: ExportParams, querystring: ExportQuery } },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ExportParams>;
      const { style } = req.query as z.infer<typeof ExportQuery>;
      const chosen = parseStyle(style);
      try {
        const data = await loadScheduleExportData(scheduleId, orgIdFor(req));
        const buf = await renderPdf(data, chosen);
        return reply
          .header('content-type', 'application/pdf')
          .header(
            'content-disposition',
            `attachment; filename="schedule-${data.weekStart}-${chosen}.pdf"`,
          )
          .header('cache-control', 'private, max-age=60')
          .send(buf);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'EXPORT_FAILED', message: (err as Error).message });
      }
    },
  );

  // Public: employee opens their personal share link in browser.
  app.get(
    '/v1/share/:token/me',
    { schema: { params: TokenParam } },
    async (req, reply) => {
      const { token } = req.params as z.infer<typeof TokenParam>;
      const decoded = verifyEmployeeToken(token);
      if (!decoded) {
        return reply.code(401).send({
          code: 'INVALID_TOKEN',
          message: 'הקישור אינו תקף או שפג תוקפו',
        });
      }
      try {
        const view = await fetchEmployeeView(
          decoded.employeeId,
          decoded.organizationId,
        );
        return reply.send(view);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'NOT_FOUND', message: (err as Error).message });
      }
    },
  );
}
