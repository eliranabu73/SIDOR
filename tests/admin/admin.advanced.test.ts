/**
 * Platform-admin extended route tests (impersonate, plan, soft-delete,
 * deactivate, system-health, charts, export, feature-flags).
 *
 * Prisma + Sentry are mocked — no DB required.
 */

const mockOrg = {
  id: '00000000-0000-0000-0000-000000000001',
  plan: 'FREE',
  featureFlags: { existing: true },
};

const txMock = {
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
    if (/FROM organizations WHERE id/i.test(sql)) {
      return [{ id: mockOrg.id, featureFlags: mockOrg.featureFlags }];
    }
    if (/date_trunc\('day', first_joined\)/i.test(sql)) {
      return [
        { date: new Date('2026-05-20'), count: BigInt(2) },
        { date: new Date('2026-05-21'), count: BigInt(3) },
      ];
    }
    if (/date_trunc\('day', "createdAt"\)::date AS date[\s\S]*FROM shifts/i.test(sql)) {
      return [{ date: new Date('2026-05-21'), count: BigInt(7) }];
    }
    return [{ count: BigInt(0) }];
  }),
  organization: {
    findUnique: jest.fn().mockResolvedValue({ id: mockOrg.id, plan: 'FREE' }),
    findMany: jest.fn().mockResolvedValue([
      {
        id: mockOrg.id,
        name: 'Org A',
        industry: 'food',
        plan: 'FREE',
        createdAt: new Date('2026-05-01'),
        defaultTimezone: 'Asia/Jerusalem',
      },
    ]),
    count: jest.fn().mockResolvedValue(1),
  },
  schedule: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  employee: { count: jest.fn().mockResolvedValue(0) },
  shift: { count: jest.fn().mockResolvedValue(0) },
  membership: { findMany: jest.fn().mockResolvedValue([]) },
  scheduleAuditLog: { findMany: jest.fn().mockResolvedValue([]) },
};

jest.mock('../../src/db/prisma', () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]),
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
  },
  withOrgContext: () => ({
    query: <T>(fn: (tx: typeof txMock) => Promise<T>) => fn(txMock),
  }),
  withAdminContext: () => ({
    query: <T>(fn: (tx: typeof txMock) => Promise<T>) => fn(txMock),
  }),
  ensureTx: async <T>(_db: unknown, fn: (tx: typeof txMock) => Promise<T>) =>
    fn(txMock),
}));

jest.mock('../../src/shared/sentry', () => ({
  initSentry: jest.fn().mockResolvedValue(undefined),
  captureException: jest.fn(),
}));

import { SignJWT } from 'jose';
import { resetJwksCache } from '../../src/modules/auth/jwt-verifier';
import { buildApp } from '../../src/app';

const TEST_SECRET = 'test-hs256-secret-must-be-32-bytes!!';
const SECRET_BYTES = new TextEncoder().encode(TEST_SECRET);
const ADMIN_EMAIL = 'eliranabu320@gmail.com';
const NON_ADMIN_EMAIL = 'someone-else@example.com';
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000aaa';

async function mintToken(opts: { email?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: opts.email,
    app_metadata: { organization_id: ORG_ID },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-admin-id')
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(SECRET_BYTES);
}

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env['SUPABASE_JWT_SECRET'] = TEST_SECRET;
  process.env['SUPABASE_URL'] = 'https://lpnqyzlfsosdxnykaaer.supabase.co';
  process.env['PLATFORM_ADMIN_EMAILS'] = ADMIN_EMAIL;
  delete process.env['AUTH_DISABLED'];
  delete process.env['SUPABASE_SERVICE_ROLE_KEY'];
  delete process.env['REDIS_URL'];
});

afterAll(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  resetJwksCache();
  jest.clearAllMocks();
});

describe('admin extended routes — gating', () => {
  const protectedRoutes: Array<[string, string, unknown?]> = [
    ['POST', '/v1/admin/impersonate', { targetUserId: USER_ID }],
    ['PATCH', `/v1/admin/orgs/${ORG_ID}/plan`, { plan: 'PRO' }],
    ['DELETE', `/v1/admin/orgs/${ORG_ID}`],
    ['PATCH', `/v1/admin/users/${USER_ID}/deactivate`, { deactivated: true }],
    ['GET', '/v1/admin/system-health'],
    ['GET', '/v1/admin/charts/signups?days=7'],
    ['GET', '/v1/admin/charts/shifts?days=7'],
    ['POST', '/v1/admin/export?type=orgs', {}],
    [
      'PATCH',
      `/v1/admin/orgs/${ORG_ID}/feature-flags`,
      { flags: { dark_mode: true } },
    ],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sharedApp: any;
  beforeAll(async () => {
    sharedApp = await buildApp();
  });
  afterAll(async () => {
    if (sharedApp) await sharedApp.close();
  });

  it('rejects non-admin on every extended admin route with 403', async () => {
    const token = await mintToken({ email: NON_ADMIN_EMAIL });
    for (const [method, url, payload] of protectedRoutes) {
      const res = await sharedApp.inject({
        method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
        url,
        headers: { Authorization: `Bearer ${token}` },
        ...(payload !== undefined ? { payload } : {}),
      });
      expect({ method, url, status: res.statusCode }).toEqual({
        method,
        url,
        status: 403,
      });
    }
  }, 60000);
});

describe('admin extended routes — behaviour', () => {
  it('PATCH /orgs/:id/plan updates the plan and audit-logs', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/orgs/${ORG_ID}/plan`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { plan: 'PRO' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ plan: string }>().plan).toBe('PRO');
    // One UPDATE + one audit INSERT
    const calls = (txMock.$executeRawUnsafe.mock.calls as string[][]).map((c) => c[0] ?? '');
    expect(calls.some((s) => /UPDATE organizations SET plan/i.test(s))).toBe(true);
    expect(calls.some((s) => /INSERT INTO schedule_audit_logs/i.test(s))).toBe(true);
    await app.close();
  });

  it('DELETE /orgs/:id soft-deletes (sets deletedAt)', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/orgs/${ORG_ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; deletedAt: string }>();
    expect(body.id).toBe(ORG_ID);
    expect(typeof body.deletedAt).toBe('string');
    const calls = (txMock.$executeRawUnsafe.mock.calls as string[][]).map((c) => c[0] ?? '');
    expect(calls.some((s) => /UPDATE organizations SET "deletedAt"/i.test(s))).toBe(true);
    await app.close();
  });

  it('GET /system-health returns the expected shape', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/system-health',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      db: { ok: boolean; latencyMs: number };
      redis: unknown;
      uptime: number;
      nodeVersion: string;
      envCheck: Record<string, boolean>;
    }>();
    expect(body.db.ok).toBe(true);
    expect(typeof body.db.latencyMs).toBe('number');
    expect(body.redis).toBeNull();
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.nodeVersion).toBe('string');
    expect(body.envCheck.hasSupabaseUrl).toBe(true);
    expect(body.envCheck.hasAdminEmails).toBe(true);
    expect(body.envCheck.hasServiceRoleKey).toBe(false);
    await app.close();
  });

  it('GET /charts/signups returns an array of {date,count}', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/charts/signups?days=30',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ date: string; count: number }>>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(typeof body[0]!.date).toBe('string');
    expect(typeof body[0]!.count).toBe('number');
    await app.close();
  });

  it('GET /charts/shifts returns an array', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/charts/shifts?days=30',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ date: string; count: number }>>();
    expect(Array.isArray(body)).toBe(true);
    await app.close();
  });

  it('POST /export?type=orgs returns CSV with content-disposition', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/export?type=orgs',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body).toMatch(/^id,name,industry,plan,createdAt,defaultTimezone/);
    await app.close();
  });

  it('PATCH /orgs/:id/feature-flags merges flags and returns merged object', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/orgs/${ORG_ID}/feature-flags`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { flags: { dark_mode: true } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ featureFlags: Record<string, boolean> }>();
    expect(body.featureFlags.dark_mode).toBe(true);
    expect(body.featureFlags.existing).toBe(true); // merged with existing
    await app.close();
  });

  it('POST /impersonate returns 501 when SUPABASE_SERVICE_ROLE_KEY missing', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/impersonate',
      headers: { Authorization: `Bearer ${token}` },
      payload: { targetUserId: USER_ID },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json<{ code: string }>().code).toBe('IMPERSONATION_NOT_CONFIGURED');
    await app.close();
  });

  it('PATCH /users/:id/deactivate runs the update SQL', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${USER_ID}/deactivate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { deactivated: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ userId: string; deactivated: boolean }>();
    expect(body.userId).toBe(USER_ID);
    expect(body.deactivated).toBe(true);
    const calls = (txMock.$executeRawUnsafe.mock.calls as string[][]).map((c) => c[0] ?? '');
    expect(calls.some((s) => /UPDATE memberships SET "deactivatedAt"/i.test(s))).toBe(true);
    await app.close();
  });
});
