import { maxHoursDayRule } from '../../src/modules/rules/rules/max-hours-day.rule';
import {
  makeAssignment,
  makeContext,
  makeShift,
} from '../factories/fixtures';

describe('maxHoursDayRule', () => {
  it('passes for a normal 8h shift', async () => {
    const r = await maxHoursDayRule(makeContext({ existingAssignments: [] }));
    expect(r.status).toBe('passed');
  });

  it('emits OVERTIME_DAILY warning past overtimeAfterDailyHours', async () => {
    const longShift = makeShift({
      startAtUtc: new Date('2026-05-25T05:00:00Z'),
      endAtUtc: new Date('2026-05-25T15:00:00Z'), // 10h
    });
    const r = await maxHoursDayRule(
      makeContext({ shift: longShift, existingAssignments: [] }),
    );
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('OVERTIME_DAILY');
  });

  it('blocks past maxHoursPerDay', async () => {
    const candidate = makeShift({
      startAtUtc: new Date('2026-05-25T06:00:00Z'),
      endAtUtc: new Date('2026-05-25T14:00:00Z'), // 8h
    });
    const other = makeAssignment({
      shift: {
        startAtUtc: new Date('2026-05-25T15:00:00Z'),
        endAtUtc: new Date('2026-05-25T20:00:00Z'), // +5h same local day
        timezone: 'Asia/Jerusalem',
      },
    });
    const r = await maxHoursDayRule(
      makeContext({
        shift: candidate,
        existingAssignments: [other],
        rulesSnapshot: {
          ...makeContext().rulesSnapshot,
          maxHoursPerDay: 12,
        },
      }),
    );
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY');
  });
});
