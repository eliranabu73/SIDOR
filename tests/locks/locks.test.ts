import { LocksService } from '../../src/modules/locks/locks.service';
import { __resetRedis } from '../../src/modules/locks/redis';

describe('LocksService (in-memory shim)', () => {
  beforeEach(() => {
    __resetRedis();
    delete process.env.REDIS_URL;
  });

  it('acquires when free', async () => {
    expect(await LocksService.acquire('shift', 's1', 'user-1')).toBe(true);
    expect(await LocksService.peek('shift', 's1')).toBe('user-1');
  });

  it('denies a second user', async () => {
    await LocksService.acquire('shift', 's1', 'user-1');
    expect(await LocksService.acquire('shift', 's1', 'user-2')).toBe(false);
  });

  it('same-user re-acquire is allowed (idempotent renewal)', async () => {
    await LocksService.acquire('shift', 's1', 'user-1');
    expect(await LocksService.acquire('shift', 's1', 'user-1')).toBe(true);
  });

  it('renew only by holder', async () => {
    await LocksService.acquire('shift', 's1', 'user-1');
    expect(await LocksService.renew('shift', 's1', 'user-1')).toBe(true);
    expect(await LocksService.renew('shift', 's1', 'user-2')).toBe(false);
  });

  it('release only by holder', async () => {
    await LocksService.acquire('shift', 's1', 'user-1');
    expect(await LocksService.release('shift', 's1', 'user-2')).toBe(false);
    expect(await LocksService.release('shift', 's1', 'user-1')).toBe(true);
    expect(await LocksService.peek('shift', 's1')).toBeNull();
  });
});
