/**
 * Realtime routes — WebSocket subscriber + presence HTTP endpoint.
 *
 * ============================================================================
 * ORCHESTRATOR NOTES (do not remove)
 * ----------------------------------------------------------------------------
 * 1. Add dependency: `@fastify/websocket@^10` to package.json. Without it this
 *    module will fail to import.
 * 2. Register in `src/app.ts` (no prefix — `/ws` is top-level and the presence
 *    route already includes `/v1` in its path):
 *
 *        await app.register(realtimeRoutes);
 * ============================================================================
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { PresenceService } from './presence.service';
import { subscribe, type Subscriber } from './redis-subscriber';

const PresenceParams = z.object({ orgId: z.string().min(1) });

const HEARTBEAT_MS = 10_000;
const PRESENCE_TTL_MS = 30_000;

function readHeader(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name];
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return null;
}

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get('/ws', { websocket: true }, async (connection, req) => {
    const userId = readHeader(req, 'x-user-id');
    const orgId = readHeader(req, 'x-org-id');

    if (!userId || !orgId) {
      try {
        connection.socket.close(4401, 'missing x-user-id or x-org-id');
      } catch {
        /* ignore */
      }
      return;
    }

    await PresenceService.touch(orgId, userId, PRESENCE_TTL_MS);

    let sub: Subscriber | null = null;
    try {
      sub = subscribe(`events:${orgId}`, (msg) => {
        try {
          connection.socket.send(msg);
        } catch {
          /* socket may be closing */
        }
      });
      if (!sub.enabled) {
        req.log.warn('realtime: no REDIS_URL — pubsub disabled');
      }
    } catch (err) {
      req.log.error({ err }, 'realtime: failed to subscribe');
    }

    const heartbeat = setInterval(() => {
      try {
        connection.socket.send(JSON.stringify({ type: 'ping' }));
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS);

    connection.socket.on('message', (raw: Buffer | string) => {
      let text: string;
      try {
        text = typeof raw === 'string' ? raw : raw.toString('utf8');
      } catch {
        return;
      }
      try {
        const parsed = JSON.parse(text) as { type?: string };
        if (parsed && parsed.type === 'pong') {
          void PresenceService.touch(orgId, userId, PRESENCE_TTL_MS);
        }
      } catch {
        /* ignore non-JSON */
      }
    });

    const cleanup = async () => {
      clearInterval(heartbeat);
      if (sub) {
        try {
          await sub.close();
        } catch {
          /* ignore */
        }
      }
      try {
        await PresenceService.clear(orgId, userId);
      } catch {
        /* ignore */
      }
    };

    connection.socket.on('close', () => {
      void cleanup();
    });
    connection.socket.on('error', () => {
      void cleanup();
    });
  });

  app.get(
    '/v1/presence/:orgId',
    { schema: { params: PresenceParams } },
    async (req) => {
      const { orgId } = req.params as z.infer<typeof PresenceParams>;
      const users = await PresenceService.list(orgId);
      return { users };
    },
  );
}

export default realtimeRoutes;
