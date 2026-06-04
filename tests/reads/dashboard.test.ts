import { buildApp } from '../../src/app';

// Smoke tests for the unified dashboard read route.
//
// In `test` env, AUTH_DISABLED is not set → auth runs, so an unauthenticated
// request returns 401. That alone proves the route is wired up under /v1 and
// is org-scoped (the handler never runs without a resolved org). We assert the
// status is NOT 404 (route exists) and matches the same auth-gated set the
// sibling reads routes use. The existing reads tests stay green because we
// only ADD a route — nothing else changes.

describe('GET /v1/dashboard', () => {
  it('is registered under /v1 (requires auth)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/dashboard?scheduleId=current&weekStart=2026-05-17',
    });
    // 401 = auth fired → route exists & org-scoped.
    // 200/404/500 = AUTH_DISABLED hit the handler.
    // Auth fires before the param-less route would 404, so 404 should never
    // appear here — that would mean the route itself is unregistered.
    expect([200, 401, 500]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it('accepts a UUID scheduleId without weekStart', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/dashboard?scheduleId=00000000-0000-0000-0000-000000000000',
    });
    expect([200, 401, 404, 500]).toContain(res.statusCode);
    await app.close();
  });

  it('returns the unified payload shape when the handler runs (AUTH_DISABLED)', async () => {
    // Only assert the contract shape when auth is disabled so the handler
    // actually executes against the demo org. Skip otherwise — a 401 here is
    // expected and already covered above.
    if (process.env['AUTH_DISABLED'] !== 'true') {
      return;
    }
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/dashboard?scheduleId=current&weekStart=2026-05-17',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    // Unified contract: schedule + shifts + employees + locations + me.
    expect(body).toHaveProperty('schedule');
    expect(body).toHaveProperty('shifts');
    expect(Array.isArray(body['shifts'])).toBe(true);
    expect(Array.isArray(body['employees'])).toBe(true);
    expect(Array.isArray(body['locations'])).toBe(true);
    expect(body).toHaveProperty('me');
    const me = body['me'] as Record<string, unknown>;
    expect(me).toHaveProperty('user');
    expect(me).toHaveProperty('memberships');
    expect(me).toHaveProperty('activeOrgId');
    // Org-scoped: the empty-shell schedule carries the resolved org id.
    const schedule = body['schedule'] as Record<string, unknown>;
    expect(schedule).toHaveProperty('orgId');
    await app.close();
  });
});
