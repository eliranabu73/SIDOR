import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SchedulerService, type ProviderName } from './scheduler.service';
import { HttpError } from '../../shared/errors';

const ScheduleIdParam = z.object({ scheduleId: z.string().uuid() });
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
  return (
    process.env['NODE_ENV'] === 'development' &&
    process.env['AUTH_DISABLED'] === 'true'
  );
}

export async function schedulerRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];
  const svc = new SchedulerService();

  app.post(
    '/schedules/:scheduleId/auto-schedule',
    {
      schema: { params: ScheduleIdParam, body: AutoScheduleBody },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof ScheduleIdParam>;
      const body = req.body as z.infer<typeof AutoScheduleBody>;

      try {
        const result = await svc.run(
          {
            scheduleId,
            dryRun: body.dryRun,
            weights: body.weights,
          },
          body.provider as ProviderName,
        );
        return reply.send(result);
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
  reply.log.error(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Internal error' });
}
