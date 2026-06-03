import { timeOffRule } from '../../src/modules/rules/rules/time-off.rule';
import { makeContext, makeShift, makeTimeOff } from '../factories/fixtures';

// Shift: Mon 06:00–14:00 UTC
const monShift = () =>
  makeShift({
    startAtUtc: new Date('2026-05-25T06:00:00Z'),
    endAtUtc: new Date('2026-05-25T14:00:00Z'),
    timezone: 'Asia/Jerusalem',
  });

describe('timeOffRule', () => {
  it('passes when there are no time-off requests', async () => {
    const ctx = makeContext({ shift: monShift(), timeOffRequests: [] });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('TIME_OFF_OK');
  });

  it('blocks a PENDING request overlapping the shift', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'PENDING',
          startAtUtc: new Date('2026-05-25T00:00:00Z'),
          endAtUtc: new Date('2026-05-26T00:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('TIME_OFF_BLOCKED');
  });

  it('blocks an APPROVED request overlapping the shift', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [makeTimeOff({ status: 'APPROVED' })],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('TIME_OFF_BLOCKED');
  });

  it('ignores REJECTED / CANCELLED requests', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({ status: 'REJECTED' }),
        makeTimeOff({ status: 'CANCELLED' }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('does not block a request that ends before the shift starts', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'APPROVED',
          startAtUtc: new Date('2026-05-24T00:00:00Z'),
          endAtUtc: new Date('2026-05-25T06:00:00Z'), // ends exactly at shift start
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
  });
});
