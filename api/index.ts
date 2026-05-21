/**
 * Vercel serverless entry point.
 *
 * Wraps the same Fastify app used by `npm run dev` so behavior matches locally.
 * The app is constructed ONCE per cold start and reused across warm invocations.
 *
 * Limitations of Vercel for this app:
 *  - `/ws` (WebSocket) WILL NOT WORK. Vercel functions are short-lived HTTP
 *    request/response only. Deploy the realtime layer to Railway/Fly/Render.
 *  - The heavy-rules worker (`npm run worker`) is a long-running process and
 *    cannot run on Vercel. Deploy as a separate service.
 *  - Prisma needs `DATABASE_URL` set in the Vercel dashboard. Use the Supabase
 *    pooled connection (port 6543) to avoid exhausting Postgres connections.
 *  - First request after deploy has ~1–2s cold-start latency.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

let cachedApp: FastifyInstance | null = null;
let initPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (cachedApp) return cachedApp;
  if (!initPromise) {
    initPromise = (async () => {
      const app = await buildApp();
      await app.ready();
      cachedApp = app;
      return app;
    })();
  }
  return initPromise;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
