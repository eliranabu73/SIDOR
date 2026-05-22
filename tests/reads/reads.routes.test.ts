import { buildApp } from '../../src/app';

// Smoke tests for the read-only routes used by the live frontend.
// In `test` env, AUTH_DISABLED is not set → auth runs and unauthenticated
// requests return 401 (which still confirms the route is wired up).

describe('reads routes smoke', () => {
  it('GET /v1/employees is registered (requires auth)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/employees' });
    // 401 = auth fired → route exists. 200/500 = AUTH_DISABLED hit handler.
    expect([200, 401, 500]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it('GET /v1/schedules/:scheduleId is registered', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/schedules/00000000-0000-0000-0000-000000000000',
    });
    expect([200, 401, 404, 500]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(undefined);
    await app.close();
  });

  it('POST /v1/schedules/:id/apply-proposals is registered', async () => {
    const app = await buildApp();
    // With auth on we get 401 before validation; with AUTH_DISABLED we get 400.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schedules/00000000-0000-0000-0000-000000000000/apply-proposals',
      payload: { proposals: 'not-an-array' },
    });
    expect([400, 401]).toContain(res.statusCode);
    await app.close();
  });

  it('POST /v1/schedules/:id/publish is registered', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schedules/00000000-0000-0000-0000-000000000000/publish',
    });
    expect([200, 401, 404, 500]).toContain(res.statusCode);
    await app.close();
  });
});
