/**
 * Billing service — Stripe Subscriptions in ILS.
 *
 * Tier model:
 *   - FREE  (0₪)            — no Stripe customer
 *   - BASIC (99₪/seat)      — STRIPE_PRICE_BASIC_ILS
 *   - PRO   (199₪/seat)     — STRIPE_PRICE_PRO_ILS
 *
 * All Stripe calls are gated on `env.STRIPE_SECRET_KEY`. When unset we
 * throw HttpError(503, 'BILLING_NOT_CONFIGURED') so existing deploys keep
 * working until Stripe creds are provisioned.
 */
import Stripe from 'stripe';
import { prisma } from '../../db/prisma.js';
import { env } from '../../env.js';
import { HttpError, NotFoundError } from '../../shared/errors.js';

// `BillingPlan` literal union — must match prisma/schema.prisma enum.
// We avoid importing the Prisma-generated enum because regenerating the
// client requires DB access (blocked in this environment); the migration
// SQL adds the enum and Prisma will pick it up on next `prisma generate`.
type BillingPlan = 'FREE' | 'BASIC' | 'PRO';

// Minimal structural types for the Stripe objects we touch — `stripe`'s d.ts
// surfaces them via `Stripe.Stripe.Event` etc, but the public namespace name
// varies across minor versions, so we lock in the shape we use locally.
interface StripeSubscription {
  id: string;
  status: string;
  current_period_end?: number;
  customer: string | { id: string };
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null }> };
}

interface StripeEvent {
  type: string;
  data: { object: unknown };
}

// Stripe runtime is typed as `any` so we don't fight namespace exports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeClient = any;

let stripeClient: StripeClient | null = null;

function getStripe(): StripeClient {
  if (!env.STRIPE_SECRET_KEY) {
    throw new HttpError(503, 'BILLING_NOT_CONFIGURED', 'Billing not configured');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
      typescript: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
  return stripeClient;
}

function priceIdFor(plan: 'BASIC' | 'PRO'): string {
  const id =
    plan === 'BASIC' ? env.STRIPE_PRICE_BASIC_ILS : env.STRIPE_PRICE_PRO_ILS;
  if (!id) {
    throw new HttpError(
      503,
      'BILLING_NOT_CONFIGURED',
      `Stripe price id missing for plan ${plan}`,
    );
  }
  return id;
}

/**
 * Find or lazily create a Stripe customer for an org and persist the id.
 * Email is optional — Stripe accepts customers without an email.
 */
export async function getOrCreateCustomer(
  orgId: string,
  email?: string | null,
): Promise<string> {
  const stripe = getStripe();
  // Cast to `any` because the generated Prisma client may not yet include
  // the new billing fields until `prisma generate` is re-run by the user.
  const org = (await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, stripeCustomerId: true } as never,
  })) as { id: string; name: string; stripeCustomerId: string | null } | null;
  if (!org) throw new NotFoundError('Organization not found');
  if (org.stripeCustomerId) return org.stripeCustomerId;

  try {
    const customer = await stripe.customers.create({
      name: org.name,
      email: email ?? undefined,
      metadata: { organizationId: org.id },
    });
    await prisma.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customer.id } as never,
    });
    return customer.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, 'STRIPE_ERROR', `Stripe customer creation failed: ${message}`);
  }
}

/**
 * Create a Stripe Checkout Session for a BASIC or PRO subscription in ILS.
 * Quantity defaults to 1 — front-end may pass seat count later.
 */
export async function createCheckoutSession(args: {
  orgId: string;
  plan: 'BASIC' | 'PRO';
  successUrl: string;
  cancelUrl: string;
  email?: string | null;
  quantity?: number;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const priceId = priceIdFor(args.plan);
  const customerId = await getOrCreateCustomer(args.orgId, args.email);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: args.quantity ?? 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      currency: 'ils',
      client_reference_id: args.orgId,
      subscription_data: {
        metadata: { organizationId: args.orgId, plan: args.plan },
      },
      metadata: { organizationId: args.orgId, plan: args.plan },
    });
    if (!session.url) {
      throw new HttpError(502, 'STRIPE_ERROR', 'Stripe did not return a checkout URL');
    }
    return { url: session.url };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, 'STRIPE_ERROR', `Checkout session failed: ${message}`);
  }
}

/**
 * Stripe Billing Portal — for the org's admin to manage / cancel subscription.
 */
export async function createBillingPortalSession(args: {
  orgId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const org = (await prisma.organization.findUnique({
    where: { id: args.orgId },
    select: { stripeCustomerId: true } as never,
  })) as { stripeCustomerId: string | null } | null;
  if (!org?.stripeCustomerId) {
    throw new HttpError(
      409,
      'NO_STRIPE_CUSTOMER',
      'Organization has no Stripe customer yet — start with a checkout session',
    );
  }
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: args.returnUrl,
    });
    return { url: portal.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, 'STRIPE_ERROR', `Portal session failed: ${message}`);
  }
}

/**
 * Map a Stripe price id → internal BillingPlan.
 */
function planForPriceId(priceId: string | undefined | null): BillingPlan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_BASIC_ILS) return 'BASIC';
  if (priceId === env.STRIPE_PRICE_PRO_ILS) return 'PRO';
  return null;
}

/**
 * Verify a Stripe webhook payload and apply subscription state to the org.
 * Handles `customer.subscription.{created,updated,deleted}` events.
 *
 * @param rawBody Raw Buffer (NOT JSON.parse'd) — required for signature check.
 * @param signature `stripe-signature` header value.
 */
export async function handleWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
): Promise<{ received: true; type?: string }> {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(503, 'BILLING_NOT_CONFIGURED', 'Webhook secret not set');
  }
  if (!signature) {
    throw new HttpError(400, 'MISSING_SIGNATURE', 'stripe-signature header missing');
  }

  let event: StripeEvent;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(400, 'INVALID_SIGNATURE', `Webhook signature verification failed: ${message}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as StripeSubscription;
      await applySubscriptionToOrg(sub, event.type === 'customer.subscription.deleted');
      break;
    }
    default:
      // Ignore other event types for now — webhook still ack'd 200.
      break;
  }

  return { received: true, type: event.type };
}

async function applySubscriptionToOrg(
  sub: StripeSubscription,
  isDeletion: boolean,
): Promise<void> {
  // Prefer explicit metadata; fall back to looking up by stripeCustomerId.
  const metaOrgId =
    (sub.metadata && (sub.metadata as Record<string, string>)['organizationId']) ||
    null;

  let orgId = metaOrgId;
  if (!orgId) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (!customerId) return;
    const org = (await prisma.organization.findFirst({
      where: { stripeCustomerId: customerId } as never,
      select: { id: true },
    })) as { id: string } | null;
    if (!org) return;
    orgId = org.id;
  }

  if (isDeletion || sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: 'FREE',
        stripeSubscriptionId: null,
        planRenewsAt: null,
      } as never,
    });
    return;
  }

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan: BillingPlan = planForPriceId(priceId) ?? 'FREE';
  const renewsAtUnix = sub.current_period_end;
  const planRenewsAt = renewsAtUnix ? new Date(renewsAtUnix * 1000) : null;

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan,
      stripeSubscriptionId: sub.id,
      planRenewsAt,
    } as never,
  });
}
