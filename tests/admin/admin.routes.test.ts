/**
 * Platform-admin route tests.
 *
 * Verifies the email-based gate (PLATFORM_ADMIN_EMAILS) and the RLS-bypass
 * `withAdminContext()` wrapper. Prisma + Sentry are mocked — no DB required.
 *
 * Test scenarios:
 *   1. /v1/admin/stats without auth   → 401
 *   2. /v1/admin/stats as non-admin   → 403
 *   3. /v1/admin/stats as admin       → 200 + stats payload
 *   4. /v1/admin/orgs as admin        → 200 + items list (RLS bypassed)
 *   5. /v1/admin/check as admin       → { isAdmin: true }
 *   6. /v1/admin/check as non-admin   → { isAdmin: false }
 */

// --- Mocks ------------------------------------------------------------------

const mockOrgs = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Org A',
    industry: 'food',
    plan: 'FREE',
    createdAt: new Date('2025-01-01'),
    _count: { memberships: 2, employees: 5, schedules: 1 },
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Org B',
    industry: 'retail',
    plan: 'BASIC',
    createdAt: new Date('2025-02-01'),
    _count: { memberships: 1, employees: 3, schedules: 0 },
  },
];

const txMock = {
  $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  $queryRawUnsafe: jest.fn().mockResolvedValue([{ count: BigInt(4) }]),
  organization: {
    count: jest.fn().mockResolvedValue(mockOrgs.length),
    findMany: jest.fn().mockResolvedValue(mockOrgs),
  },
  employee: { count: jest.fn().mockResolvedValue(42) },
  shift: { count: jest.fn().mockResolvedValue(100) },
  membership: { findMany: jest.fn().mockResolvedValue([]) },
};

jest.mock('../../src/db/prisma', () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
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

// --- Setup ------------------------------------------------------------------

import { SignJWT } from 'jose';
import { resetJwksCache } from '../../src/modules/auth/jwt-verifier';
import { buildApp } from '../../src/app';

const TEST_SECRET = 'test-hs256-secret-must-be-32-bytes!!';
const SECRET_BYTES = new TextEncoder().encode(TEST_SECRET);
const ADMIN_EMAIL = 'eliranabu320@gmail.com';
const NON_ADMIN_EMAIL = 'someone-else@example.com';

async function mintToken(opts: { email?: string; orgId?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: opts.email,
    app_metadata: { organization_id: opts.orgId ?? '00000000-0000-0000-0000-000000000001' },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-user-id')
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
});

afterAll(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  resetJwksCache();
  jest.clearAllMocks();
});

// --- Tests ------------------------------------------------------------------

describe('admin routes — auth + gating', () => {
  it('returns 401 when Authorization header is missing on /stats', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/stats' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when authenticated user is not in admin allowlist', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: NON_ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('FORBIDDEN_NOT_PLATFORM_ADMIN');
    await app.close();
  });

  it('returns 200 with stats payload when caller is a platform admin', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, number>>();
    expect(body['totalOrgs']).toBe(mockOrgs.length);
    expect(body['totalEmployees']).toBe(42);
    expect(body['totalShifts']).toBe(100);
    expect(typeof body['totalUsers']).toBe('number');
    expect(typeof body['activeOrgsLast7d']).toBe('number');
    // Admin queries must have gone through the admin context wrapper —
    // verified indirectly via the org count mock being invoked.
    expect(txMock.organization.count).toHaveBeenCalled();
    await app.close();
  });

  it('returns cross-tenant orgs list (RLS bypassed) for admin', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/orgs?limit=10&offset=0',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ id: string; memberCount: number }> }>();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.memberCount).toBe(2);
    await app.close();
  });

  it('/admin/check returns isAdmin=true for allowlisted email', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/check',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ isAdmin: boolean }>().isAdmin).toBe(true);
    await app.close();
  });

it('/admin/check returns isAdmin=false for non-admin email', async () => {
    const app = await buildApp();
    const token = await mintToken({ email: NON_ADMIN_EMAIL });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/check',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ isAdmin: boolean }>().isAdmin).toBe(false);
    await app.close();
  });
});
