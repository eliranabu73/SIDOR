import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  buildPublishBundle,
  fetchEmployeeView,
  verifyEmployeeToken,
} from './share.service';

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
