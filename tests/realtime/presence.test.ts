import { PresenceService } from '../../src/modules/realtime/presence.service';
import { __resetRedis, getRedis } from '../../src/modules/locks/redis';

describe('PresenceService (in-memory shim)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    __resetRedis();
    // Force singleton init (MemoryRedis) before each test.
    getRedis();
  });

  afterEach(() => {
    __resetRedis();
  });

  it('touch then list returns the user; clear empties the list', async () => {
    const orgId = 'org-1';
    const userId = 'user-a';

    await PresenceService.touch(orgId, userId);

    const after = await PresenceService.list(orgId);
    expect(after).toHaveLength(1);
    expect(after[0]!.userId).toBe(userId);
    expect(typeof after[0]!.connectedAt).toBe('string');

    await PresenceService.clear(orgId, userId);
    const empty = await PresenceService.list(orgId);
    expect(empty).toHaveLength(0);
  });

  it('list returns multiple users in the same org', async () => {
    const orgId = 'org-2';
    await PresenceService.touch(orgId, 'u1');
    await PresenceService.touch(orgId, 'u2');
    await PresenceService.touch(orgId, 'u3');

    const list = await PresenceService.list(orgId);
    const ids = list.map((u) => u.userId).sort();
    expect(ids).toEqual(['u1', 'u2', 'u3']);
  });

  it('list scopes by orgId', async () => {
    await PresenceService.touch('orgA', 'u1');
    await PresenceService.touch('orgB', 'u2');

    const a = await PresenceService.list('orgA');
    const b = await PresenceService.list('orgB');
    expect(a.map((u) => u.userId)).toEqual(['u1']);
    expect(b.map((u) => u.userId)).toEqual(['u2']);
  });
});
