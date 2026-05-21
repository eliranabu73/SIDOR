/**
 * Dedicated subscribe-mode Redis connection wrapper.
 *
 * ioredis requires a separate connection for subscribe-mode (once a connection
 * is in subscribed state, it cannot issue normal commands). We therefore do NOT
 * reuse the singleton from `getRedis()`; we open a new connection per channel
 * subscription (or per WebSocket).
 *
 * When `REDIS_URL` is empty, subscription is disabled (the in-memory shim has
 * no pubsub). Callers should check the returned object's `enabled` flag.
 */
import Redis from 'ioredis';

export interface Subscriber {
  enabled: boolean;
  close: () => Promise<void>;
}

export function subscribe(
  channel: string,
  onMessage: (message: string) => void,
): Subscriber {
  const url = process.env.REDIS_URL;
  if (!url) {
    return {
      enabled: false,
      close: async () => {
        /* noop */
      },
    };
  }

  const client = new Redis(url, { lazyConnect: false });

  // Fire-and-forget subscribe; errors are surfaced via the 'error' event.
  void client.subscribe(channel).catch(() => {
    /* swallow — connection error will be emitted */
  });

  client.on('message', (_ch, msg) => {
    try {
      onMessage(msg);
    } catch {
      /* never let handler error kill the connection */
    }
  });

  client.on('error', () => {
    /* swallow; connection will reconnect or be closed by caller */
  });

  return {
    enabled: true,
    close: async () => {
      try {
        await client.unsubscribe(channel);
      } catch {
        /* ignore */
      }
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}
