// Enable auth bypass for tests
process.env['AUTH_DISABLED'] = 'true';

import { buildApp } from '../../src/app';

describe('GET /v1/templates', () => {
  it('returns all 13 templates', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string }>;
    expect(body).toHaveLength(13);
    await app.close();
  });

  it('each template has id, name, emoji, roles, shiftCount', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/templates' });
    const templates = res.json() as Array<Record<string, unknown>>;
    for (const tpl of templates) {
      expect(tpl['id']).toBeTruthy();
      expect(tpl['name']).toBeTruthy();
      expect(tpl['emoji']).toBeTruthy();
      expect(Array.isArray(tpl['roles'])).toBe(true);
      expect(typeof tpl['shiftCount']).toBe('number');
    }
    await app.close();
  });

  it('includes the 5 new template IDs', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/templates' });
    const ids = (res.json() as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain('kindergarten');
    expect(ids).toContain('school');
    expect(ids).toContain('homecare');
    expect(ids).toContain('events');
    expect(ids).toContain('garage');
    await app.close();
  });
});

describe('POST /v1/templates/:id/apply', () => {
  // The apply route hits the DB (roles/locations/schedules/shifts/organization).
  // Skipping DB-dependent happy-path tests; only the pure 404 path is exercised here.
  it.skip('applies a known template (requires DB)', async () => {
    // requires DB
  });

  it('returns 404 for unknown template', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/templates/nonexistent/apply',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
