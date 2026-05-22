/**
 * Billing routes — Stripe Checkout, Billing Portal, and webhook receiver.
 *
 * Mounted under `/v1` in src/app.ts (except webhook which uses a raw-body
 * content parser and is registered at the same prefix).
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../shared/errors.js';
import { env } from '../../env.js';
import {
  createBillingPortalSession,
  createCheckoutSession,
  handleWebhook,
} from './billing.service.js';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}

const PlanEnum = z.enum(['BASIC', 'PRO']);

const CheckoutBody = z.object({
  plan: PlanEnum,
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  quantity: z.number().int().min(1).max(10000).optional(),
});

const PortalBody = z.object({
  returnUrl: z.string().url().optional(),
});

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  // ---------------------------------------------------------------------
  // Raw-body parser for the Stripe webhook route ONLY.
  //
  // Stripe signs the exact bytes of the request body, so we must NOT let
  // Fastify's default JSON parser run first. We add a parser scoped to the
  // 'application/json' content type that just hands back the Buffer.
  //
  // Because adding a content-type parser is global, we differentiate by
  // looking at the URL — webhook gets raw, everything else falls through
  // to the default JSON parser.
  // ---------------------------------------------------------------------
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      if (req.routerPath === '/v1/billing/webhook' || req.url === '/v1/billing/webhook') {
        // Stash the raw buffer on the request for the handler.
        (req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer;
        // Return the buffer as the parsed body too — handler reads rawBody.
        done(null, body);
        return;
      }
      try {
        const text = (body as Buffer).toString('utf8');
        const parsed = text.length === 0 ? {} : JSON.parse(text);
        done(null, parsed);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        e.statusCode = 400;
        done(e, undefined);
      }
    },
  );

  app.post(
    '/billing/checkout-session',
    { schema: { body: CheckoutBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = req.body as z.infer<typeof CheckoutBody>;
      try {
        const result = await createCheckoutSession({
          orgId: orgIdFor(req),
          plan: body.plan,
          email: body.email,
          quantity: body.quantity,
          successUrl: body.successUrl ?? `${env.PUBLIC_WEB_URL}/billing/success`,
          cancelUrl: body.cancelUrl ?? `${env.PUBLIC_WEB_URL}/billing/cancel`,
        });
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  app.post(
    '/billing/portal-session',
    { schema: { body: PortalBody }, preHandler: authHandlers },
    async (req, reply) => {
      const body = (req.body ?? {}) as z.infer<typeof PortalBody>;
      try {
        const result = await createBillingPortalSession({
          orgId: orgIdFor(req),
          returnUrl: body.returnUrl ?? `${env.PUBLIC_WEB_URL}/settings/billing`,
        });
        return reply.send(result);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // Webhook — no auth, raw body, Stripe signature verification in service.
  app.post('/billing/webhook', async (req, reply) => {
    try {
      const sig = req.headers['stripe-signature'];
      const sigStr = Array.isArray(sig) ? sig[0] : sig;
      const raw =
        (req as unknown as { rawBody?: Buffer }).rawBody ??
        (Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(JSON.stringify(req.body ?? {})));
      const result = await handleWebhook(raw, sigStr);
      return reply.send(result);
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });
}

function handleHttpError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply
      .code(err.statusCode)
      .send({ code: err.code, message: err.message, details: err.details ?? null });
  }
  reply.log.error(err);
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message });
}
