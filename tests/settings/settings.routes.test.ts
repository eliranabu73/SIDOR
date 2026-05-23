/**
 * HTTP-level tests for the settings routes.
 * Uses AUTH_DISABLED=true so auth is bypassed and orgIdFor() falls back
 * to DEMO_ORG_ID ('10000000-0000-0000-0000-000000000001').
 *
 * Prisma is mocked so no real DB is required.
 *
 * NOTE: AUTH_DISABLED is set in beforeAll and restored in afterAll to prevent
 * leaking into other test files that share the same Jest worker.
 */

// Mock prisma before any imports that pull in the db module.
jest.mock('../../src/db/prisma', () => ({ prisma: { organization: {}, role: {}, location: {} } }));
jest.mock('../../src/shared/sentry', () => ({
  initSentry: jest.fn().mockResolvedValue(undefined),
  captureException: jest.fn(),
}));

import { buildApp } from '../../src/app';
import { prisma } from '../../src/db/prisma';

// Save and restore AUTH_DISABLED so this file doesn't pollute other workers.
const originalAuthDisabled = process.env['AUTH_DISABLED'];
beforeAll(() => { process.env['AUTH_DISABLED'] = 'true'; });
afterAll(() => {
  if (originalAuthDisabled === undefined) {
    delete process.env['AUTH_DISABLED'];
  } else {
    process.env['AUTH_DISABLED'] = originalAuthDisabled;
  }
});

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';

const mockOrg = {
  id: DEMO_ORG_ID,
  name: 'Demo Cafe',
  industry: 'food',
  defaultTimezone: 'Asia/Jerusalem',
  weekStartDay: 0,
  plan: 'free',
  laborRulesJsonb: { maxHoursDay: 10 },
  roles: [{ id: 'role-1', name: 'מלצר', description: null }],
  locations: [{ id: 'loc-1', name: 'ראשי', timezone: null, address: null }],
};

function stubOrg(overrides: Partial<typeof mockOrg> = {}) {
  const org = { ...mockOrg, ...overrides };
  // findUniqueOrThrow is called by getOrgSettings and patchOrgSettings
  (prisma.organization as jest.Mocked<any>).findUniqueOrThrow = jest
    .fn()
    .mockResolvedValue(org);
  (prisma.organization as jest.Mocked<any>).update = jest
    .fn()
    .mockResolvedValue(org);
}

describe('GET /v1/settings', () => {
  it('מחזיר 200 עם שדות הגדרות הארגון', async () => {
    stubOrg();
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body['id']).toBe(DEMO_ORG_ID);
    expect(body['name']).toBe('Demo Cafe');
    expect(typeof body['defaultTimezone']).toBe('string');
    expect(typeof body['weekStartDay']).toBe('number');
    expect(Array.isArray(body['roles'])).toBe(true);
    expect(Array.isArray(body['locations'])).toBe(true);
    await app.close();
  });
});

describe('PATCH /v1/settings', () => {
  it('מחזיר 200 ומשקף עדכון של industry', async () => {
    stubOrg({ industry: 'garage' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/settings',
      payload: { industry: 'garage' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body['industry']).toBe('garage');
    await app.close();
  });

  it('מחזיר 400 כאשר industry ארוך מדי (מעל 100 תווים)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/settings',
      payload: { industry: 'x'.repeat(101) },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('מחזיר 400 כאשר name ריק', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/settings',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('מחזיר 400 כאשר weekStartDay לא תקין (מחוץ לטווח 0-6)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/settings',
      payload: { weekStartDay: 7 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('שומר שדות שלא נגעו בהם ב-patch חלקי', async () => {
    stubOrg({ name: 'Demo Cafe', industry: 'food', weekStartDay: 0 });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/settings',
      payload: { weekStartDay: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    // name and industry should still be present from the stub
    expect(body['name']).toBe('Demo Cafe');
    await app.close();
  });

  it('מחזיר 400 כאשר laborRules.maxHoursDay מחוץ לטווח', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/settings',
      payload: { laborRules: { maxHoursDay: 25 } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
