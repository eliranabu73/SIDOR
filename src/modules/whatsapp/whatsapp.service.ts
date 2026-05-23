/**
 * WhatsApp Cloud API integration for sidor4S.
 *
 * Two send modes:
 *  - Template send (recommended for first-touch): uses an approved Meta
 *    template (`schedule_published_v1`) with two body parameters
 *    `{{1}}=week range`, `{{2}}=personal share URL`.
 *  - Plain text send is intentionally not exposed here — it only works in
 *    the 24h "customer-service window" after the user messaged us, which we
 *    can't reliably guarantee at publish time.
 *
 * Every attempt persists a `MessageDelivery` row BEFORE the network call so
 * we always have an audit trail even when the API errors. Webhook receipts
 * mutate the same row by `wabaMessageId`.
 *
 * All API calls are gated on `env.WHATSAPP_TOKEN` being set — callers should
 * surface HTTP 503 when it isn't. We never let the Cloud API failure cascade
 * into the schedule-publish transaction.
 */
import { env } from '../../env';
import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { buildPublishBundle } from '../share/share.service';

// ---------------------------------------------------------------------------
// HttpError — Fastify error handler reads statusCode + code off the error.
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function requireConfigured(): void {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    throw new HttpError(
      503,
      'WHATSAPP_NOT_CONFIGURED',
      'WhatsApp Cloud API credentials are not configured on this deploy',
    );
  }
}

// ---------------------------------------------------------------------------
// Phone normalisation — must match share.service.whatsappLinkForPhone so the
// "manual" and "auto-send" flows target the same WA account.
// ---------------------------------------------------------------------------

export function normalisePhoneForWaba(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return null;
  // Israeli local 05X → 9725X (international, no leading "+" — Meta wants raw digits).
  return digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
}

// ---------------------------------------------------------------------------
// Cloud API low-level wrapper
// ---------------------------------------------------------------------------

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

type CloudApiResponse = {
  messaging_product?: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
  error?: { message: string; type?: string; code?: number; fbtrace_id?: string };
};

async function callCloudApi(body: Record<string, unknown>): Promise<CloudApiResponse> {
  const url = `${GRAPH_BASE}/${env.WHATSAPP_PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: CloudApiResponse;
  try {
    json = text ? (JSON.parse(text) as CloudApiResponse) : {};
  } catch {
    throw new HttpError(
      502,
      'WHATSAPP_BAD_RESPONSE',
      `Meta returned non-JSON response (status ${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new HttpError(502, 'WHATSAPP_API_ERROR', `Meta Cloud API: ${msg}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Send a single template message to one employee
// ---------------------------------------------------------------------------

export type SendScheduleParams = {
  /** International-formatted phone digits (e.g. "972501234567"). */
  to: string;
  /** Human-readable week range, e.g. "2026-05-24 – 2026-05-30". */
  week: string;
  /** Personal share URL — passed as a body parameter, not a URL button. */
  link: string;
  /** Override the default template name. */
  templateName?: string;
  /** Override the default template language code. */
  languageCode?: string;
};

export type SendResult = {
  deliveryId: string;
  status: 'sent' | 'failed';
  wabaMessageId?: string;
  error?: string;
};

/**
 * Send the schedule-published template to a single employee. Creates a
 * MessageDelivery row first, then updates it with the API outcome.
 */
export async function sendScheduleToEmployee(
  orgId: string,
  employeeId: string,
  params: SendScheduleParams,
  db: Db = defaultPrisma,
): Promise<SendResult> {
  requireConfigured();

  const templateName = params.templateName ?? env.WHATSAPP_TEMPLATE_NAME;
  const languageCode = params.languageCode ?? env.WHATSAPP_TEMPLATE_LANG;

  const requestBody: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.week },
            { type: 'text', text: params.link },
          ],
        },
      ],
    },
  };

  const delivery = await db.messageDelivery.create({
    data: {
      organizationId: orgId,
      employeeId,
      channel: 'whatsapp_cloud',
      templateName,
      payload: requestBody as object,
      status: 'queued',
    },
    select: { id: true },
  });

  try {
    const res = await callCloudApi(requestBody);
    const wabaId = res.messages?.[0]?.id;
    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'sent',
        wabaMessageId: wabaId ?? null,
      },
    });
    const ok: SendResult = { deliveryId: delivery.id, status: 'sent' };
    if (wabaId) ok.wabaMessageId = wabaId;
    return ok;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', error: message.slice(0, 500) },
    });
    return { deliveryId: delivery.id, status: 'failed', error: message };
  }
}

// ---------------------------------------------------------------------------
// Bulk send — wraps buildPublishBundle and sends one message per employee
// with a non-empty phone number.
// ---------------------------------------------------------------------------

export type BulkDelivery = {
  employeeId: string;
  fullName: string;
  phone: string | null;
  status: 'sent' | 'failed' | 'skipped_no_phone' | 'dry_run';
  deliveryId?: string;
  wabaMessageId?: string;
  error?: string;
};

export type BulkResult = {
  weekStart: string;
  weekEnd: string;
  sent: number;
  failed: number;
  skipped: number;
  deliveries: BulkDelivery[];
};

export async function sendBulkSchedulePublish(
  orgId: string,
  scheduleId: string,
  options: { dryRun?: boolean } = {},
  db: Db = defaultPrisma,
): Promise<BulkResult> {
  if (!options.dryRun) {
    requireConfigured();
  }

  const bundle = await buildPublishBundle({ scheduleId, organizationId: orgId }, db);
  const week = `${bundle.weekStart} – ${bundle.weekEnd}`;
  const deliveries: BulkDelivery[] = [];

  for (const link of bundle.links) {
    const to = normalisePhoneForWaba(link.phone);
    if (!to) {
      deliveries.push({
        employeeId: link.employeeId,
        fullName: link.fullName,
        phone: link.phone,
        status: 'skipped_no_phone',
      });
      continue;
    }
    if (options.dryRun) {
      deliveries.push({
        employeeId: link.employeeId,
        fullName: link.fullName,
        phone: link.phone,
        status: 'dry_run',
      });
      continue;
    }
    const result = await sendScheduleToEmployee(
      orgId,
      link.employeeId,
      {
        to,
        week,
        link: link.url,
      },
      db,
    );
    const row: BulkDelivery = {
      employeeId: link.employeeId,
      fullName: link.fullName,
      phone: link.phone,
      status: result.status,
      deliveryId: result.deliveryId,
    };
    if (result.wabaMessageId) row.wabaMessageId = result.wabaMessageId;
    if (result.error) row.error = result.error;
    deliveries.push(row);
  }

  const sent = deliveries.filter((d) => d.status === 'sent').length;
  const failed = deliveries.filter((d) => d.status === 'failed').length;
  const skipped = deliveries.filter(
    (d) => d.status === 'skipped_no_phone',
  ).length;

  return {
    weekStart: bundle.weekStart,
    weekEnd: bundle.weekEnd,
    sent,
    failed,
    skipped,
    deliveries,
  };
}

// ---------------------------------------------------------------------------
// Webhook status updates: Meta posts JSON with `entry[].changes[].value.statuses[]`
// each carrying { id (wamid), status, timestamp, recipient_id, errors? }.
// ---------------------------------------------------------------------------

type WabaStatus = {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp?: string;
  errors?: Array<{ title?: string; message?: string; code?: number }>;
};

type WabaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        statuses?: WabaStatus[];
        // We ignore inbound `messages[]` for now — used for opt-in/replies.
      };
    }>;
  }>;
};

/**
 * Update MessageDelivery rows from Meta status receipts. Idempotent: a later
 * "read" event simply overwrites the prior "delivered" status.
 */
export async function handleStatusUpdate(
  payload: WabaWebhookPayload,
  db: Db = defaultPrisma,
): Promise<{
  updated: number;
}> {
  let updated = 0;
  const entries = payload.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const errMsg = s.errors?.[0]?.message ?? s.errors?.[0]?.title;
        const data: { status: string; error?: string } = { status: s.status };
        if (errMsg) data.error = errMsg.slice(0, 500);
        const res = await db.messageDelivery.updateMany({
          where: { wabaMessageId: s.id },
          data,
        });
        updated += res.count;
      }
    }
  }
  return { updated };
}
