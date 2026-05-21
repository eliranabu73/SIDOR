import { getRedis, type RedisLike } from '../locks/redis';

export interface PresenceEntry {
  userId: string;
  connectedAt: string;
}

function key(orgId: string, userId: string): string {
  return `presence:${orgId}:${userId}`;
}

function pattern(orgId: string): string {
  return `presence:${orgId}:*`;
}

export const PresenceService = {
  async touch(orgId: string, userId: string, ttlMs = 30_000): Promise<void> {
    const redis = getRedis();
    const payload = JSON.stringify({ connectedAt: new Date().toISOString() });
    await redis.set(key(orgId, userId), payload, 'PX', ttlMs);
  },

  async clear(orgId: string, userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(key(orgId, userId));
  },

  async list(orgId: string): Promise<PresenceEntry[]> {
    const redis: RedisLike = getRedis();
    if (typeof redis.keys !== 'function') {
      // eslint-disable-next-line no-console
      console.warn('presence.list: redis.keys() not available; returning empty list');
      return [];
    }
    const keys = await redis.keys(pattern(orgId));
    const prefix = `presence:${orgId}:`;
    const results: PresenceEntry[] = [];
    for (const k of keys) {
      const userId = k.startsWith(prefix) ? k.slice(prefix.length) : k;
      const raw = await redis.get(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { connectedAt?: string };
        results.push({
          userId,
          connectedAt: parsed.connectedAt ?? new Date(0).toISOString(),
        });
      } catch {
        results.push({ userId, connectedAt: new Date(0).toISOString() });
      }
    }
    return results;
  },
};
