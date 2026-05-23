/**
 * HTTP-level tests for the share routes.
 *
 * We build a minimal Fastify app that registers ONLY the share routes
 * (via shareRoutes) with maxParamLength=500, avoiding conflicts with
 * the full app (which has duplicate /v1/employees routes between reads and
 * employees modules) and sidestepping the default maxParamLength=100 limit
 * that truncates long base64url tokens in path params.
 *
 * Endpoints tested:
 *   GET  /v1/share/:token/me            — public, token-gated
 *   POST /v1/share/:token/time-off      — public, token-gated
 *   PUT  /v1/share/:token/availability  — public, token-gated
 *   POST /v1/schedules/:id/publish-message — auth-gated (requires JWT)
 */

jest.mock('../../src/db/prisma', () => ({
  prisma: {},
  // Routes wrap service calls in withOrgContext(orgId).query(fn).  Since the
  // services themselves are mocked above we just need the wrapper to invoke
  // the function with a noop tx and forward the result.
  withOrgContext: (_orgId: string) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: <T>(fn: (tx: any) => Promise<T>): Promise<T> => fn({} as any),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ensureTx: <T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> => fn(db),
}));
jest.mock('../../src/shared/sentry', () => ({
  initSentry: jest.fn().mockResolvedValue(undefined),
  captureException: jest.fn(),
}));
jest.mock('../../src/env', () => ({
  env: {
    EMPLOYEE_SHARE_SECRET: 'test-share-secret-32-bytes-ok!!!',
    JWT_SECRET: 'test-jwt-secret',
    PUBLIC_WEB_URL: 'https://sidor-test.vercel.app',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PORT: 3000,
    SENTRY_DSN: '',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    SUPABASE_JWT_SECRET: '',
    REDIS_URL: '',
    DIRECT_URL: '',
    TEST_DATABASE_URL: '',
    DATABASE_URL: 'postgresql://dummy',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_BASIC_ILS: '',
    STRIPE_PRICE_PRO_ILS: '',
    WHATSAPP_PHONE_ID: '',
    WHATSAPP_TOKEN: '',
    WHATSAPP_VERIFY_TOKEN: '',
    WHATSAPP_APP_SECRET: '',
    WHATSAPP_TEMPLATE_NAME: 'schedule_published_v1',
    WHATSAPP_TEMPLATE_LANG: 'he',
    ANTHROPIC_API_KEY: '',
  },
}));

// Mock the service functions that hit the DB.
jest.mock('../../src/modules/share/share.service', () => {
  const actual = jest.requireActual('../../src/modules/share/share.service');
  return {
    ...actual,
    fetchEmployeeView: jest.fn().mockResolvedValue({
      employee: { id: 'emp-demo', fullName: 'ישראל ישראלי', phone: null, email: null },
      organization: { name: 'Demo Cafe', defaultTimezone: 'Asia/Jerusalem' },
      shifts: [],
    }),
    buildPublishBundle: jest.fn().mockResolvedValue({
      weekStart: '2026-06-01',
      weekEnd: '2026-06-07',
      groupMessage: 'test',
      links: [],
    }),
  };
});

jest.mock('../../src/modules/share/share-actions.service', () => ({
  createTimeOffRequest: jest.fn().mockResolvedValue({
    id: 'tor-1',
    status: 'PENDING',
    startAtUtc: new Date('2026-06-10T08:00:00Z'),
    endAtUtc: new Date('2026-06-11T08:00:00Z'),
  }),
  replaceAvailability: jest.fn().mockResolvedValue([
    {
      id: 'avail-1',
      dayOfWeek: 1,
      startLocalTime: '08:00:00',
      endLocalTime: '16:00:00',
      availabilityType: 'AVAILABLE',
    },
  ]),
  fetchEmployeeActivity: jest.fn().mockResolvedValue({ timeOff: [], availability: [] }),
}));

// Export/image routes — skip heavy dependencies
jest.mock('../../src/modules/share/export/data', () => ({
  loadScheduleExportData: jest.fn(),
}));
jest.mock('../../src/modules/share/export/png-renderer', () => ({
  renderPng: jest.fn(),
}));
jest.mock('../../src/modules/share/export/pdf-renderer', () => ({
  renderPdf: jest.fn(),
}));

import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { shareRoutes } from '../../src/modules/share/share.routes';
import { signEmployeeToken } from '../../src/modules/share/share.service';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
const DEMO_EMP_ID = '20000000-0000-0000-0000-000000000002';

/**
 * Build a lightweight Fastify app with only the share routes registered.
 * maxParamLength=500 accommodates the full base64url token (~200 chars).
 * AUTH_DISABLED=true so the manager-only publish-message route is also wired
 * without a real JWT plugin; we test the 401 path by NOT setting it.
 */
async function buildShareApp(authDisabled = false) {
  const old = process.env['AUTH_DISABLED'];
  if (authDisabled) process.env['AUTH_DISABLED'] = 'true';
  else delete process.env['AUTH_DISABLED'];

  const app = Fastify({
    logger: false,
    maxParamLength: 500,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensible);

  // Minimal auth stub — if AUTH_DISABLED is false, authenticate throws 401.
  app.decorate('authenticate', async (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
    reply.code(401).send({ code: 'UNAUTHORIZED', message: 'auth required' });
  });

  await app.register(shareRoutes);
  await app.ready();

  // Restore env
  if (old === undefined) delete process.env['AUTH_DISABLED'];
  else process.env['AUTH_DISABLED'] = old;

  return app;
}

function validToken(): string {
  return signEmployeeToken({
    employeeId: DEMO_EMP_ID,
    organizationId: DEMO_ORG_ID,
    ttlSeconds: 3600,
  });
}

function expiredToken(): string {
  return signEmployeeToken({
    employeeId: DEMO_EMP_ID,
    organizationId: DEMO_ORG_ID,
    ttlSeconds: -60,
  });
}

// ---------------------------------------------------------------------------
describe('GET /v1/share/:token/me', () => {
  it('מחזיר 401 עבור טוקן לא תקין', async () => {
    const app = await buildShareApp(true);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/share/invalid-token-abc/me',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'INVALID_TOKEN' });
    await app.close();
  });

  it('מחזיר 401 עבור טוקן שפג תוקפו', async () => {
    const token = expiredToken();
    const app = await buildShareApp(true);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/share/${token}/me`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('מחזיר 200 עם מערך משמרות עבור טוקן תקין', async () => {
    const token = validToken();
    const app = await buildShareApp(true);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/share/${token}/me`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(Array.isArray(body['shifts'])).toBe(true);
    expect(body['employee']).toBeTruthy();
    await app.close();
  });
});

describe('POST /v1/share/:token/time-off', () => {
  it('מחזיר 201 עם גוף תקין', async () => {
    const token = validToken();
    const app = await buildShareApp(true);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/share/${token}/time-off`,
      payload: {
        startsAt: '2026-06-10T08:00:00.000Z',
        endsAt: '2026-06-11T08:00:00.000Z',
        reason: 'חופשה',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(body['id']).toBeTruthy();
    expect(body['status']).toBeTruthy();
    await app.close();
  });
});

describe('PUT /v1/share/:token/availability', () => {
  it('מחזיר 200 עם חוקי זמינות', async () => {
    const token = validToken();
    const app = await buildShareApp(true);
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/share/${token}/availability`,
      payload: {
        rules: [
          {
            dayOfWeek: 1,
            startLocalTime: '08:00',
            endLocalTime: '16:00',
            type: 'AVAILABLE',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(Array.isArray(body['rules'])).toBe(true);
    await app.close();
  });
});

describe('POST /v1/schedules/:id/publish-message', () => {
  it('מחזיר 401 ללא אימות (auth-gated)', async () => {
    // AUTH_DISABLED is NOT set → authenticate decorator fires → 401
    const app = await buildShareApp(false);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schedules/sched-demo/publish-message',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
