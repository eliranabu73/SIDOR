import { maxHoursWeekRule } from '../../src/modules/rules/rules/max-hours-week.rule';
import { makeContext, makeMetrics, makeShift } from '../factories/fixtures';

describe('maxHoursWeekRule', () => {
  it('passes when projected total is within the limit', async () => {
    const ctx = makeContext({
      shift: makeShift({
        startAtUtc: new Date('2026-05-25T06:00:00Z'),
        endAtUtc: new Date('2026-05-25T14:00:00Z'),
      }),
      metrics: makeMetrics({ totalScheduledMinutes: 10 * 60 }),
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('warns when projected total exceeds weekly overtime threshold', async () => {
    const ctx = makeContext({
      shift: makeShift({
        startAtUtc: new Date('2026-05-25T06:00:00Z'),
        endAtUtc: new Date('2026-05-25T14:00:00Z'), // +8h
      }),
      metrics: makeMetrics({ totalScheduledMinutes: 36 * 60 }), // 36+8 = 44h > 42
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('OVERTIME_WEEKLY');
  });

  it('blocks when projected total exceeds maxHoursPerWeek', async () => {
    const ctx = makeContext({
      shift: makeShift({
        startAtUtc: new Date('2026-05-25T06:00:00Z'),
        endAtUtc: new Date('2026-05-25T16:00:00Z'), // +10h
      }),
      metrics: makeMetrics({ totalScheduledMinutes: 40 * 60 }),
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK');
  });

  it('passes when metrics is null', async () => {
    const ctx = makeContext({
      shift: makeShift({
        startAtUtc: new Date('2026-05-25T06:00:00Z'),
        endAtUtc: new Date('2026-05-25T14:00:00Z'),
      }),
      metrics: null,
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
  });
});
