import { getRedis } from './redis';

const DEFAULT_TTL_MS = 60_000;

export type LockEntityType = 'schedule' | 'shift' | 'assignment';

function key(entity: LockEntityType, id: string): string {
  return `lock:${entity}:${id}`;
}

export const LocksService = {
  /** Try to acquire — true on success, false if held by a different user. */
  async acquire(
    entity: LockEntityType,
    entityId: string,
    userId: string,
    ttlMs = DEFAULT_TTL_MS,
  ): Promise<boolean> {
    const redis = getRedis();
    const k = key(entity, entityId);
    const existing = await redis.get(k);
    if (existing && existing !== userId) return false;
    const ok = await redis.set(k, userId, 'PX', ttlMs);
    return ok === 'OK';
  },

  /** Renew an existing lock you already hold; returns true on success. */
  async renew(
    entity: LockEntityType,
    entityId: string,
    userId: string,
    ttlMs = DEFAULT_TTL_MS,
  ): Promise<boolean> {
    const redis = getRedis();
    const k = key(entity, entityId);
    const existing = await redis.get(k);
    if (existing !== userId) return false;
    await redis.set(k, userId, 'PX', ttlMs);
    return true;
  },

  /** Release — only if you hold it. */
  async release(
    entity: LockEntityType,
    entityId: string,
    userId: string,
  ): Promise<boolean> {
    const redis = getRedis();
    const k = key(entity, entityId);
    const existing = await redis.get(k);
    if (existing !== userId) return false;
    await redis.del(k);
    return true;
  },

  /** Read-only: who holds the lock (or null). */
  async peek(entity: LockEntityType, entityId: string): Promise<string | null> {
    const redis = getRedis();
    return redis.get(key(entity, entityId));
  },
};
