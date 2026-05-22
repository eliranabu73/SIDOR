/**
 * Vision-import routes — /v1/import/parse + /v1/import/apply.
 *
 * Both require auth (org-scoped via req.user.orgId).
 *
 * Rate-limit NOTE: production should rate-limit /import/parse since each
 * call hits the Anthropic Vision API (cost + quota). Suggested limit:
 * 10 req/min per user, 100 req/day per org. Wire via @fastify/rate-limit
 * once Redis is configured.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../shared/errors.js';
import { parseScheduleImage } from './vision-import.service.js';
import { applyImport } from './import-apply.service.js';

const ParseBody = z.object({
  imageBase64: z.string().min(64).max(20 * 1024 * 1024),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  hints: z.string().max(2000).optional(),
});

const ApplyBody = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be YYYY-MM-DD')
    .optional(),
  scheduleId: z.string().uuid().optional(),
  defaultLocationId: z.string().uuid().optional(),
  employees: z
    .array(
      z.object({
        fullName: z.string().min(1).max(120),
        phone: z.string().max(40).optional(),
        role: z.string().max(80).optional(),
        skip: z.boolean().optional(),
      }),
    )
    .max(500),
  shifts: z
    .array(
      z.object({
        dayOfWeek: z.union([z.number().int().min(0).max(6), z.string()]),
        startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        role: z.string().max(80).optional(),
        employees: z.array(z.string()).optional(),
        skip: z.boolean().optional(),
      }),
    )
    .max(2000),
});

function handle(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply
      .code(err.statusCode)
      .send({ code: err.code, message: err.message, details: err.details ?? null });
  }
  reply.log.error(err);
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message });
}

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/import/parse',
    { preHandler: [app.authenticate], schema: { body: ParseBody } },
    async (req, reply) => {
      const body = req.body as z.infer<typeof ParseBody>;
      try {
        const result = await parseScheduleImage({
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
          ...(body.hints ? { hints: body.hints } : {}),
        });
        return reply.send(result);
      } catch (err) {
        return handle(reply, err);
      }
    },
  );

  app.post(
    '/import/apply',
    { preHandler: [app.authenticate], schema: { body: ApplyBody } },
    async (req, reply) => {
      const body = req.body as z.infer<typeof ApplyBody>;
      const u = req.user!;
      if (!u.orgId) {
        return reply.code(400).send({
          code: 'NO_ORG',
          message: 'User has no active organization',
        });
      }
      try {
        const result = await applyImport({
          orgId: u.orgId,
          userId: u.id,
          ...(body.weekStart ? { weekStart: body.weekStart } : {}),
          ...(body.scheduleId ? { scheduleId: body.scheduleId } : {}),
          ...(body.defaultLocationId
            ? { defaultLocationId: body.defaultLocationId }
            : {}),
          employees: body.employees,
          shifts: body.shifts,
        });
        return reply.code(201).send(result);
      } catch (err) {
        return handle(reply, err);
      }
    },
  );
}
