import { consecutiveDaysMaxRule } from '../../src/modules/rules/rules/consecutive-days-max.rule';
import { minWageCheckRule } from '../../src/modules/rules/rules/min-wage-check.rule';
import { pregnancyNightRule } from '../../src/modules/rules/rules/pregnancy-night.rule';
import { holidayEveMaxHoursRule } from '../../src/modules/rules/rules/holiday-eve-max-hours.rule';
import { youthNightCurfewRule } from '../../src/modules/rules/rules/youth-night-curfew.rule';
import type { EmployeeWithRoles } from '../../src/modules/rules/types';
import {
  makeContext,
  makeEmployee,
  makeShift,
  makeAssignment,
} from '../factories/fixtures';

// ---------------------------------------------------------------------------
// 1. consecutiveDaysMaxRule
// ---------------------------------------------------------------------------
describe('consecutiveDaysMaxRule', () => {
  // Build a candidate shift on 2026-06-08 (Monday) and 5 prior assignments
  // on Mon-Fri (2026-06-01 through 2026-06-05), so the candidate is day 6.
  function makePriorDays(count: number, startDate: Date) {
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      return makeAssignment({
        shift: {
          startAtUtc: d,
          endAtUtc: new Date(d.getTime() + 8 * 3600 * 1000),
        },
      });
    });
  }

  it('6th consecutive day should PASS (within IL limit of 6)', async () => {
    // Prior shifts on days 1-5, candidate on day 6
    const priorStart = new Date('2026-06-01T06:00:00Z');
    const priorAssignments = makePriorDays(5, priorStart);
    const candidate = makeShift({
      id: 'cand-day6',
      startAtUtc: new Date('2026-06-06T06:00:00Z'),
      endAtUtc: new Date('2026-06-06T14:00:00Z'),
    });
    const r = await consecutiveDaysMaxRule(
      makeContext({ shift: candidate, existingAssignments: priorAssignments }),
    );
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('CONSECUTIVE_DAYS_MAX');
  });

  it('7th consecutive day should FAIL (blocking)', async () => {
    // Prior shifts on days 1-6, candidate on day 7
    const priorStart = new Date('2026-06-01T06:00:00Z');
    const priorAssignments = makePriorDays(6, priorStart);
    const candidate = makeShift({
      id: 'cand-day7',
      startAtUtc: new Date('2026-06-07T06:00:00Z'),
      endAtUtc: new Date('2026-06-07T14:00:00Z'),
    });
    const r = await consecutiveDaysMaxRule(
      makeContext({ shift: candidate, existingAssignments: priorAssignments }),
    );
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('CONSECUTIVE_DAYS_MAX');
    expect((r.metadata as { consecutiveDays: number }).consecutiveDays).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 2. minWageCheckRule
// ---------------------------------------------------------------------------
describe('minWageCheckRule', () => {
  it('FAIL warning when hourlyRate=30 (below ₪35.40 minimum)', async () => {
    const emp = { ...makeEmployee(), hourlyRate: 30 } as unknown as EmployeeWithRoles;
    const r = await minWageCheckRule(makeContext({ employee: emp }));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('MIN_WAGE_CHECK');
  });

  it('PASS when hourlyRate=36 (above minimum)', async () => {
    const emp = { ...makeEmployee(), hourlyRate: 36 } as unknown as EmployeeWithRoles;
    const r = await minWageCheckRule(makeContext({ employee: emp }));
    expect(r.status).toBe('passed');
  });

  it('PASS when no hourlyRate set (null)', async () => {
    const emp = { ...makeEmployee(), hourlyRate: null } as unknown as EmployeeWithRoles;
    const r = await minWageCheckRule(makeContext({ employee: emp }));
    expect(r.status).toBe('passed');
  });
});

// ---------------------------------------------------------------------------
// 3. pregnancyNightRule
// ---------------------------------------------------------------------------
describe('pregnancyNightRule', () => {
  // Night shift: 22:30 local → 06:00+1 local. Use UTC times that land in
  // Asia/Jerusalem night window. Jerusalem is UTC+3 in summer (IDT).
  // 22:30 IDT = 19:30 UTC. 06:00 IDT next day = 03:00 UTC next day.
  const nightShift = makeShift({
    id: 'night',
    startAtUtc: new Date('2026-06-01T19:30:00Z'), // 22:30 IDT
    endAtUtc: new Date('2026-06-02T03:00:00Z'),   // 06:00 IDT next day
    timezone: 'Asia/Jerusalem',
  });

  it('FAIL blocking: isPregnant=true, pregnancyWeeks=25 on night shift', async () => {
    const emp = makeEmployee({
      isPregnant: true,
      pregnancyWeeks: 25,
    } as Parameters<typeof makeEmployee>[0]);
    const r = await pregnancyNightRule(makeContext({ employee: emp, shift: nightShift }));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('PREGNANCY_NIGHT');
  });

  it('PASS when isPregnant=false on night shift', async () => {
    const emp = makeEmployee({
      isPregnant: false,
    } as Parameters<typeof makeEmployee>[0]);
    const r = await pregnancyNightRule(makeContext({ employee: emp, shift: nightShift }));
    expect(r.status).toBe('passed');
  });

  it('FAIL warning: isPregnant=true, pregnancyWeeks=15 (under week 20)', async () => {
    const emp = makeEmployee({
      isPregnant: true,
      pregnancyWeeks: 15,
    } as Parameters<typeof makeEmployee>[0]);
    const r = await pregnancyNightRule(makeContext({ employee: emp, shift: nightShift }));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('PREGNANCY_NIGHT');
  });
});

// ---------------------------------------------------------------------------
// 4. holidayEveMaxHoursRule
// ---------------------------------------------------------------------------
describe('holidayEveMaxHoursRule', () => {
  // Friday in Israel: 2026-06-05 is a Friday.
  // UTC offset for Jerusalem IDT = UTC+3, so local 07:00 = UTC 04:00.
  const fridayStart = new Date('2026-06-05T04:00:00Z'); // 07:00 IDT Friday

  it('FAIL warning: Friday 8-hour shift (> 7 hour limit)', async () => {
    const shift = makeShift({
      startAtUtc: fridayStart,
      endAtUtc: new Date(fridayStart.getTime() + 8 * 3600 * 1000),
      timezone: 'Asia/Jerusalem',
    });
    const r = await holidayEveMaxHoursRule(makeContext({ shift }));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('HOLIDAY_EVE_MAX_HOURS');
  });

  it('PASS: Friday 6-hour shift (within 7 hour limit)', async () => {
    const shift = makeShift({
      startAtUtc: fridayStart,
      endAtUtc: new Date(fridayStart.getTime() + 6 * 3600 * 1000),
      timezone: 'Asia/Jerusalem',
    });
    const r = await holidayEveMaxHoursRule(makeContext({ shift }));
    expect(r.status).toBe('passed');
  });

  it('PASS: Saturday 8-hour shift (rule only applies on Friday)', async () => {
    // 2026-06-06 is a Saturday
    const satStart = new Date('2026-06-06T04:00:00Z'); // 07:00 IDT Saturday
    const shift = makeShift({
      startAtUtc: satStart,
      endAtUtc: new Date(satStart.getTime() + 8 * 3600 * 1000),
      timezone: 'Asia/Jerusalem',
    });
    const r = await holidayEveMaxHoursRule(makeContext({ shift }));
    expect(r.status).toBe('passed');
  });
});

// ---------------------------------------------------------------------------
// 5. youthNightCurfewRule — BUG FIX: age 15 on Friday past 20:00 must FAIL
// ---------------------------------------------------------------------------
describe('youthNightCurfewRule (bug fix: under-16 Friday curfew)', () => {
  it('FAIL blocking: age 15, Friday shift ending 21:00 (past 20:00 curfew)', async () => {
    // Employee born ~15 years ago: 2011-06-01
    const dob = new Date('2011-06-01T00:00:00Z');
    const emp = makeEmployee({ dateOfBirth: dob } as Parameters<typeof makeEmployee>[0]);

    // Friday 2026-06-05, shift 18:00–21:00 IDT = UTC 15:00–18:00
    const shift = makeShift({
      startAtUtc: new Date('2026-06-05T15:00:00Z'), // 18:00 IDT Friday
      endAtUtc: new Date('2026-06-05T18:00:00Z'),   // 21:00 IDT Friday
      timezone: 'Asia/Jerusalem',
    });

    const r = await youthNightCurfewRule(makeContext({ employee: emp, shift }));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('YOUTH_NIGHT_CURFEW');
    // Confirm curfew hour is 20 (not 22 which was the old buggy behaviour)
    expect((r.metadata as { curfewHour: number }).curfewHour).toBe(20);
    expect((r.metadata as { under16: boolean }).under16).toBe(true);
  });

  it('PASS: age 16, Friday shift ending 21:00 (22:00 curfew on non-school day)', async () => {
    // Employee born ~16 years ago: 2009-06-01 — would be 17 at shift date
    const dob = new Date('2010-01-01T00:00:00Z'); // turns 16 in Jan 2026
    const emp = makeEmployee({ dateOfBirth: dob } as Parameters<typeof makeEmployee>[0]);

    // Friday 2026-06-05, shift ending 21:00 IDT — should pass for 16-17 on Fri
    const shift = makeShift({
      startAtUtc: new Date('2026-06-05T15:00:00Z'),
      endAtUtc: new Date('2026-06-05T18:00:00Z'),
      timezone: 'Asia/Jerusalem',
    });

    const r = await youthNightCurfewRule(makeContext({ employee: emp, shift }));
    expect(r.status).toBe('passed');
  });
});
