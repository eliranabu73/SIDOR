import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { signPosterToken, verifyPosterToken } from './share.service';
import { loadScheduleExportData } from './export/data';
import { renderPng } from './export/png-renderer';
import { isExportStyle, type ExportStyle } from './export/types';
import { prisma } from '../../db/prisma';
import type { PrismaClient } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
function devAllowed(): boolean {
  return process.env['AUTH_DISABLED'] === 'true';
}
function dbFor(req: {
  orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> };
}) {
  return (
    req.orgPrisma ?? {
      query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma),
    }
  );
}

function parseStyle(v: unknown): ExportStyle {
  return isExportStyle(v) ? v : 'branded';
}

function buildOrigin(req: FastifyRequest): string {
  // Prefer canonical forwarded host (Vercel/CF/Heroku). Fall back to req.headers.host.
  const xfHost = req.headers['x-forwarded-host'];
  const host =
    (Array.isArray(xfHost) ? xfHost[0] : xfHost) ||
    (req.headers['host'] as string | undefined) ||
    '';
  const xfProto = req.headers['x-forwarded-proto'];
  const proto =
    (Array.isArray(xfProto) ? xfProto[0] : xfProto) || (req.protocol ?? 'https');
  return `${proto}://${host}`;
}

/**
 * Public poster-image route + the manager-only mint endpoint.
 *
 * The PNG URL is intentionally crawlable: when pasted into WhatsApp (web or
 * mobile), Meta's link-preview fetcher hits the URL and renders the schedule
 * thumbnail directly in the chat — no file attachment needed.
 */
export async function posterRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = devAllowed() ? [] : [app.authenticate];

  // MANAGER-ONLY: mint a 7-day signed URL for the schedule poster PNG.
  const MintParams = z.object({ scheduleId: z.string() });
  const MintQuery = z.object({ style: z.string().optional() });
  app.post(
    '/v1/share/schedules/:scheduleId/poster-link',
    {
      schema: { params: MintParams, querystring: MintQuery },
      preHandler: authHandlers,
    },
    async (req, reply) => {
      const { scheduleId } = req.params as z.infer<typeof MintParams>;
      const { style } = req.query as z.infer<typeof MintQuery>;
      const chosen = parseStyle(style);
      const orgId = orgIdFor(req);
      try {
        // Validate manager actually owns / can access this schedule before
        // minting (RLS-aware lookup).
        const schedule = await dbFor(req).query((tx) =>
          tx.schedule.findFirst({
            where: { id: scheduleId, organizationId: orgId },
            select: { id: true },
          }),
        );
        if (!schedule) {
          return reply.code(404).send({
            code: 'SCHEDULE_NOT_FOUND',
            message: 'הסידור לא נמצא או שאין הרשאה',
          });
        }
        const token = signPosterToken({
          scheduleId,
          organizationId: orgId,
        });
        const origin = buildOrigin(req);
        const url = `${origin}/v1/share/poster/${scheduleId}/${token}.png?style=${chosen}`;
        return reply.send({ url, expiresInDays: 7 });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'POSTER_LINK_FAILED', message: (err as Error).message });
      }
    },
  );

  // PUBLIC: stream a styled PNG of the schedule. WhatsApp's link-preview
  // crawler hits this URL when the link is pasted into a chat, rendering the
  // PNG as a thumbnail. 7-day cache to play nice with link-preview caches.
  const StreamParams = z.object({
    scheduleId: z.string(),
    token: z.string().min(8),
  });
  const StreamQuery = z.object({ style: z.string().optional() });
  app.get(
    '/v1/share/poster/:scheduleId/:token.png',
    { schema: { params: StreamParams, querystring: StreamQuery } },
    async (req, reply) => {
      const { scheduleId, token } = req.params as z.infer<typeof StreamParams>;
      const { style } = req.query as z.infer<typeof StreamQuery>;
      const decoded = verifyPosterToken(token, scheduleId);
      if (!decoded) {
        return reply
          .code(401)
          .send({ code: 'INVALID_TOKEN', message: 'הקישור אינו תקף או שפג תוקפו' });
      }
      try {
        const data = await loadScheduleExportData(
          scheduleId,
          decoded.organizationId,
        );
        const buf = await renderPng(data, parseStyle(style));
        return reply
          .header('content-type', 'image/png')
          .header('cache-control', 'public, max-age=604800, immutable')
          .header('x-content-type-options', 'nosniff')
          .send(buf);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply
          .code(status)
          .send({ code: 'POSTER_FAILED', message: (err as Error).message });
      }
    },
  );
}
