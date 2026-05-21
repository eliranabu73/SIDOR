import { buildApp } from '../../src/app';

describe('HTTP smoke', () => {
  it('GET /health returns ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    await app.close();
  });

  it('PATCH /v1/shifts/:shiftId/assignments rejects bad body with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/shifts/00000000-0000-0000-0000-000000000000/assignments',
      payload: { employeeId: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
