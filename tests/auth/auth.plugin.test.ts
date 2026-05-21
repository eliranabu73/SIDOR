/**
 * Fastify integration tests for the auth plugin.
 *
 * Builds a minimal Fastify instance with only the auth plugin registered
 * plus a single test route `/test-auth` protected by `app.authenticate`.
 * Uses `app.inject()` — no network, no DB.
 */
import Fastify from 'fastify';
import { SignJWT } from 'jose';
import authPlugin from '../../src/modules/auth/auth.plugin';
import { resetJwksCache } from '../../src/modules/auth/jwt-verifier';

const TEST_SECRET = 'test-hs256-secret-must-be-32-bytes!!';
const SECRET_BYTES = new TextEncoder().encode(TEST_SECRET);

const VALID_ORG = 'org-integration-test';
const VALID_USER = 'user-integration-0001';

async function mintToken(
  opts: Partial<{
    sub: string;
    aud: string;
    exp: number;
    orgId: string;
    role: string;
  }> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    app_metadata: {
      organization_id: opts.orgId ?? VALID_ORG,
      role: opts.role ?? 'employee',
    },
    user_metadata: {},
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.sub ?? VALID_USER)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt(now)
    .setExpirationTime(opts.exp ?? now + 3600)
    .sign(SECRET_BYTES);
}

async function buildTestApp() {
  // Set env vars before importing env module
  process.env['SUPABASE_JWT_SECRET'] = TEST_SECRET;
  process.env['SUPABASE_URL'] = 'https://lpnqyzlfsosdxnykaaer.supabase.co';

  const app = Fastify({
    logger: false,
    // Redact Authorization header from logs (OWASP A02)
    disableRequestLogging: true,
  });

  await app.register(authPlugin);

  // Protected test route
  app.get('/test-auth', { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });

  await app.ready();
  return app;
}

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeEach(async () => {
  resetJwksCache();
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth plugin — protected route', () => {
  it('returns 200 and req.user when a valid HS256 token is provided', async () => {
    const token = await mintToken();

    const res = await app.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: { id: string; orgId: string; role: string } }>();
    expect(body.user.id).toBe(VALID_USER);
    expect(body.user.orgId).toBe(VALID_ORG);
    expect(body.user.role).toBe('employee');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-auth' });

    expect(res.statusCode).toBe(401);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header is not Bearer scheme', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is malformed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { Authorization: 'Bearer not.a.real.jwt' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is expired', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = await mintToken({ exp: past });

    const res = await app.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token audience is wrong', async () => {
    const token = await mintToken({ aud: 'service_role' });

    const res = await app.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is signed with a different secret', async () => {
    const wrongSecret = new TextEncoder().encode('completely-wrong-secret-for-test!');
    const token = await new SignJWT({ app_metadata: { organization_id: VALID_ORG } })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(VALID_USER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongSecret);

    const res = await app.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('UNAUTHORIZED');
  });
});
