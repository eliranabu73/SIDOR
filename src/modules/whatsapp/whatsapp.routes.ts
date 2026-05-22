/**
 * WhatsApp routes:
 *   POST /v1/schedules/:id/whatsapp-send  — manager-auth, bulk send.
 *   GET  /v1/whatsapp/webhook             — Meta verification challenge.
 *   POST /v1/whatsapp/webhook             — Meta status callbacks.
 *
 * The webhook endpoints must remain UNAUTHENTICATED (Meta calls them from its
 * own network) — we authenticate them via the verify token (GET) and the
 * x-hub-signature-256 HMAC (POST).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../env';
import {
  HttpError,
  handleStatusUpdate,
  sendBulkSchedulePublish,
} from './whatsapp.service';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}

const ScheduleParam = z.object({ id: z.string().min(1) });
const SendBody = z.object({ dryRun: z.boolean().optional() });

const WebhookVerifyQuery = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
});

/**
 * Verify Meta's `x-hub-signature-256: sha256=<hex>` header against the raw
 * request body using the App Secret. Falls back to WHATSAPP_TOKEN when no
 * dedicated app secret is configured (less ideal but matches some hobby
 * deploys). Returns true when the configured secret is empty (dev mode).
 */
function verifyMetaSignature(req: FastifyRequest, rawBody: string): boolean {
  const secret = env.WHATSAPP_APP_SECRET || env.WHATSAPP_TOKEN;
  if (!secret) {
    // No secret configured — accept (dev). Production deploys must set one.
    return true;
  }
  const header = req.headers['x-hub-signature-256'];
  if (!header || typeof header !== 'string' || !header.startsWith('sha256=')) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(header.slice('sha256='.length), 'hex');
  } catch {
    return false;
  }
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // -----------------------------------------------------------------------
  // Manager-auth: bulk-send the schedule-published template to all employees.
  // -----------------------------------------------------------------------
  app.post(
    '/v1/schedules/:id/whatsapp-send',
    { schema: { params: ScheduleParam, body: SendBody }, preHandler: authHandlers },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof ScheduleParam>;
      const body = (req.body ?? {}) as z.infer<typeof SendBody>;
      try {
        const result = await sendBulkSchedulePublish(orgIdFor(req), id, {
          dryRun: body.dryRun ?? false,
        });
        return reply.send(result);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        const code = (err as { code?: string }).code ?? 'WHATSAPP_SEND_FAILED';
        return reply
          .code(status)
          .send({ code, message: (err as Error).message });
      }
    },
  );

  // -----------------------------------------------------------------------
  // Meta verification GET — return hub.challenge raw when verify_token matches.
  // -----------------------------------------------------------------------
  app.get(
    '/v1/whatsapp/webhook',
    { schema: { querystring: WebhookVerifyQuery } },
    async (req, reply) => {
      const q = req.query as z.infer<typeof WebhookVerifyQuery>;
      const mode = q['hub.mode'];
      const token = q['hub.verify_token'];
      const challenge = q['hub.challenge'] ?? '';
      const expected = env.WHATSAPP_VERIFY_TOKEN;
      if (mode === 'subscribe' && expected && token === expected) {
        reply.header('content-type', 'text/plain');
        return reply.send(challenge);
      }
      return reply
        .code(403)
        .send({ code: 'WEBHOOK_VERIFY_FAILED', message: 'Bad verify token' });
    },
  );

  // -----------------------------------------------------------------------
  // Meta POST callback — status updates (sent / delivered / read / failed)
  // and inbound message events. We only act on status updates today.
  // -----------------------------------------------------------------------
  app.post('/v1/whatsapp/webhook', async (req, reply) => {
    // Fastify already parsed JSON — reconstruct a deterministic raw string
    // for the HMAC. Meta signs the raw bytes; round-tripping through JSON.stringify
    // works as long as no proxy mutates the body. For production-grade
    // correctness, register a raw-body parser scoped to this route.
    const rawBody = JSON.stringify(req.body ?? {});
    if (!verifyMetaSignature(req, rawBody)) {
      return reply
        .code(401)
        .send({ code: 'WEBHOOK_BAD_SIGNATURE', message: 'Invalid signature' });
    }
    try {
      const result = await handleStatusUpdate(
        (req.body ?? {}) as Parameters<typeof handleStatusUpdate>[0],
      );
      // Meta expects a 200 OK to stop retrying — keep the body lightweight.
      return reply.send({ ok: true, updated: result.updated });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply
          .code(err.statusCode)
          .send({ code: err.code, message: err.message });
      }
      req.log.error({ err }, 'whatsapp webhook handler failed');
      // Still return 200 so Meta doesn't hammer us — log + Sentry capture
      // happens in the global error handler if we re-throw.
      return reply.send({ ok: false });
    }
  });
}
