import Redis from 'ioredis';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  quit?(): Promise<unknown>;
}

/** In-memory shim — only for dev/test when REDIS_URL is unset. */
class MemoryRedis implements RedisLike {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<string | null> {
    let nx = false;
    let ttlMs = 0;
    for (let i = 0; i < args.length; i++) {
      const flag = String(args[i]).toUpperCase();
      if (flag === 'NX') nx = true;
      else if (flag === 'PX') ttlMs = Number(args[i + 1] ?? 0);
      else if (flag === 'EX') ttlMs = Number(args[i + 1] ?? 0) * 1000;
    }
    if (nx) {
      const existing = await this.get(key);
      if (existing) return null;
    }
    this.store.set(key, {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async publish(_channel: string, _message: string): Promise<number> {
    return 0;
  }
}

let singleton: RedisLike | null = null;

export function getRedis(): RedisLike {
  if (singleton) return singleton;
  const url = process.env.REDIS_URL;
  if (!url) {
    singleton = new MemoryRedis();
  } else {
    // ioredis' `.set` signature is broader than RedisLike but compatible at runtime.
    singleton = new Redis(url, { lazyConnect: false }) as unknown as RedisLike;
  }
  return singleton!;
}

/** Test helper: replace the singleton (e.g., with `ioredis-mock`). */
export function __setRedisForTests(r: RedisLike): void {
  singleton = r;
}

export function __resetRedis(): void {
  singleton = null;
}
