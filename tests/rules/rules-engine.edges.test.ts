/**
 * Rules-engine EDGE cases — boundary-focused.
 *
 * Timezone note: Asia/Jerusalem in late May 2026 is IDT = UTC+3.
 * So a UTC time T appears locally as T+3h. Shifts below pick UTC instants so
 * that the local-day arithmetic is easy to reason about.
 *
 * All these rules use STRICT comparisons (`<`, `>`), so an EXACT boundary value
 * is the PASS side and one minute past is the FAIL side. Each block asserts
 * both sides of the threshold.
 */
import { timeOffRule } from '../../src/modules/rules/rules/time-off.rule';
import { overlapRule } from '../../src/modules/rules/rules/overlap.rule';
import { minRestRule } from '../../src/modules/rules/rules/min-rest.rule';
import { maxHoursDayRule } from '../../src/modules/rules/rules/max-hours-day.rule';
import { maxHoursWeekRule } from '../../src/modules/rules/rules/max-hours-week.rule';
import { availabilityRule } from '../../src/modules/rules/rules/availability.rule';
import { employeeActiveRule } from '../../src/modules/rules/rules/employee-active.rule';
import { shiftNotLockedRule } from '../../src/modules/rules/rules/shift-not-locked.rule';
import {
  makeAssignment,
  makeAvailability,
  makeContext,
  makeEmployee,
  makeMetrics,
  makeShift,
  makeTimeOff,
  IDS,
} from '../factories/fixtures';

// Canonical Monday shift: 2026-05-25 06:00Z → 14:00Z (local 09:00→17:00 IDT)
const monShift = () =>
  makeShift({
    startAtUtc: new Date('2026-05-25T06:00:00Z'),
    endAtUtc: new Date('2026-05-25T14:00:00Z'),
    timezone: 'Asia/Jerusalem',
  });

// ───────────────────────────────────────────────────────────────────────────
// TIME-OFF — half-open window semantics: shift.start < req.end && req.start < shift.end
// ───────────────────────────────────────────────────────────────────────────
describe('timeOffRule — boundaries', () => {
  it('PASS: request ends exactly at shift start (touching, no overlap)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'APPROVED',
          startAtUtc: new Date('2026-05-25T00:00:00Z'),
          endAtUtc: new Date('2026-05-25T06:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('TIME_OFF_OK');
  });

  it('PASS: request starts exactly at shift end (touching, no overlap)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'APPROVED',
          startAtUtc: new Date('2026-05-25T14:00:00Z'),
          endAtUtc: new Date('2026-05-25T20:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: request ends one minute after shift start (1-min overlap)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'APPROVED',
          startAtUtc: new Date('2026-05-25T00:00:00Z'),
          endAtUtc: new Date('2026-05-25T06:01:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('TIME_OFF_BLOCKED');
  });

  it('FAIL: request starts one minute before shift end (1-min overlap)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'PENDING',
          startAtUtc: new Date('2026-05-25T13:59:00Z'),
          endAtUtc: new Date('2026-05-25T20:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('TIME_OFF_BLOCKED');
  });

  it('FAIL: request fully contained inside the shift window', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'APPROVED',
          startAtUtc: new Date('2026-05-25T10:00:00Z'),
          endAtUtc: new Date('2026-05-25T11:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('failed');
  });

  it('PASS: overlapping window but status REJECTED does not block', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'REJECTED',
          startAtUtc: new Date('2026-05-25T06:00:00Z'),
          endAtUtc: new Date('2026-05-25T14:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('PASS: overlapping window but status CANCELLED does not block', async () => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({
          status: 'CANCELLED',
          startAtUtc: new Date('2026-05-25T06:00:00Z'),
          endAtUtc: new Date('2026-05-25T14:00:00Z'),
        }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: among several requests, first matching PENDING/APPROVED is reported', async () => {
    const blocker = makeTimeOff({
      status: 'APPROVED',
      startAtUtc: new Date('2026-05-25T07:00:00Z'),
      endAtUtc: new Date('2026-05-25T09:00:00Z'),
    });
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({ status: 'REJECTED' }),
        blocker,
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.metadata?.timeOffRequestId).toBe(blocker.id);
    expect(r.metadata?.timeOffStatus).toBe('APPROVED');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// OVERLAP — intervalsOverlap is strict: touching ≠ overlap; 1 min ⇒ overlap.
// Only ACTIVE statuses count: PROPOSED, CONFIRMED, COMPLETED.
// ───────────────────────────────────────────────────────────────────────────
describe('overlapRule — boundaries', () => {
  it('PASS: existing shift ends exactly when candidate starts (touching)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T00:00:00Z'),
            endAtUtc: new Date('2026-05-25T06:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('NO_OVERLAP');
  });

  it('PASS: existing shift starts exactly when candidate ends (touching)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T14:00:00Z'),
            endAtUtc: new Date('2026-05-25T18:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: existing shift overlaps candidate by one minute at the start', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T00:00:00Z'),
            endAtUtc: new Date('2026-05-25T06:01:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('SHIFT_OVERLAP');
  });

  it('FAIL: existing shift overlaps candidate by one minute at the end', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T13:59:00Z'),
            endAtUtc: new Date('2026-05-25T18:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('failed');
  });

  it('PASS: overlapping shift but assignment is CANCELLED (inactive status)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CANCELLED',
          shift: {
            startAtUtc: new Date('2026-05-25T06:00:00Z'),
            endAtUtc: new Date('2026-05-25T14:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('PASS: overlapping shift but assignment is DECLINED (inactive status)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'DECLINED',
          shift: {
            startAtUtc: new Date('2026-05-25T06:00:00Z'),
            endAtUtc: new Date('2026-05-25T14:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('PASS: same shift id is ignored (self)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shiftId: IDS.SHIFT_ID,
          shift: {
            id: IDS.SHIFT_ID,
            startAtUtc: new Date('2026-05-25T06:00:00Z'),
            endAtUtc: new Date('2026-05-25T14:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: candidate fully contained inside an existing shift (PROPOSED)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'PROPOSED',
          shift: {
            startAtUtc: new Date('2026-05-25T00:00:00Z'),
            endAtUtc: new Date('2026-05-25T20:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('failed');
    expect((r.metadata?.conflictingShiftIds as string[]).length).toBe(1);
  });

  it('FAIL: reports all conflicting shift ids', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T05:00:00Z'),
            endAtUtc: new Date('2026-05-25T07:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
        makeAssignment({
          assignmentStatus: 'COMPLETED',
          shift: {
            startAtUtc: new Date('2026-05-25T13:00:00Z'),
            endAtUtc: new Date('2026-05-25T15:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('failed');
    expect((r.metadata?.conflictingShiftIds as string[]).length).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// MIN-REST — gap < minRestMs ⇒ FAIL. Default min rest = 8h.
// Candidate monShift starts 06:00Z. A prior shift ending at 06:00Z-8h=22:00Z
// previous day gives EXACTLY 8h gap ⇒ PASS. One minute less ⇒ FAIL.
// ───────────────────────────────────────────────────────────────────────────
describe('minRestRule — boundaries (8h default)', () => {
  it('PASS: prior shift ends exactly 8h before candidate start', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-24T18:00:00Z'),
            endAtUtc: new Date('2026-05-24T22:00:00Z'), // 22:00Z → +8h = 06:00Z
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MIN_REST_OK');
  });

  it('FAIL: prior shift ends 7h59m before candidate (one minute short)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-24T18:00:00Z'),
            endAtUtc: new Date('2026-05-24T22:01:00Z'), // gap = 7h59m
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('MIN_REST_BETWEEN_SHIFTS');
    expect(r.metadata?.requiredRestHours).toBe(8);
    expect(r.metadata?.actualRestHours).toBeCloseTo(7.9833, 3);
  });

  it('PASS: next shift starts exactly 8h after candidate end (forward gap)', async () => {
    const ctx = makeContext({
      shift: monShift(), // ends 14:00Z
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T22:00:00Z'), // 14:00Z + 8h
            endAtUtc: new Date('2026-05-26T02:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: next shift starts 7h59m after candidate end', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T21:59:00Z'), // gap = 7h59m
            endAtUtc: new Date('2026-05-26T02:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('failed');
  });

  it('PASS: overlapping neighbour is skipped by min-rest (overlapRule owns it)', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T10:00:00Z'),
            endAtUtc: new Date('2026-05-25T12:00:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('PASS: CANCELLED neighbour with a tiny gap is ignored', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CANCELLED',
          shift: {
            startAtUtc: new Date('2026-05-25T04:00:00Z'),
            endAtUtc: new Date('2026-05-25T05:00:00Z'), // 1h gap but cancelled
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: with custom 12h rest, exactly 11h gap fails', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, minRestHoursBetweenShifts: 12 },
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-24T15:00:00Z'),
            endAtUtc: new Date('2026-05-24T19:00:00Z'), // 19:00Z → 06:00Z = 11h
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.metadata?.actualRestHours).toBeCloseTo(11, 5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// MAX-HOURS-DAY — maxHoursPerDay=12 (block), overtimeAfterDailyHours=8 (warn).
// monShift is 8h. Add same-day assignments to push totals.
// ───────────────────────────────────────────────────────────────────────────
describe('maxHoursDayRule — boundaries (12h block / 8h overtime)', () => {
  it('PASS: exactly 8h total = overtime threshold, not over it (no warning)', async () => {
    // monShift alone = 8h = overtimeMinutes; rule uses strict > so this passes clean
    const ctx = makeContext({ shift: monShift(), existingAssignments: [] });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
  });

  it('WARNING: 8h01m same-day total crosses the overtime threshold', async () => {
    // monShift 8h + 2 min same-day shift = 8h02m > 8h
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T15:00:00Z'),
            endAtUtc: new Date('2026-05-25T15:02:00Z'),
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('OVERTIME_DAILY');
  });

  it('PASS: exactly 12h total = daily max, not over it', async () => {
    // monShift 8h + 4h same local day = 12h exactly. Strict > → passes the block,
    // but 12h > 8h overtime ⇒ WARNING expected.
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T15:00:00Z'),
            endAtUtc: new Date('2026-05-25T19:00:00Z'), // +4h, local same Monday
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await maxHoursDayRule(ctx);
    // 12h is NOT > 12h max, so not blocked; but it IS > 8h overtime → warning
    expect(r.ruleCode).toBe('OVERTIME_DAILY');
    expect(r.severity).toBe('warning');
  });

  it('FAIL/BLOCK: 12h01m total exceeds the daily max', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T15:00:00Z'),
            endAtUtc: new Date('2026-05-25T19:01:00Z'), // 4h01m → total 12h01m
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY');
    expect(r.metadata?.totalMinutes).toBe(12 * 60 + 1);
  });

  it('PASS: a different local day does not add to the candidate day total', async () => {
    // Add a long shift on the NEXT local day; should not affect Monday total.
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-26T06:00:00Z'),
            endAtUtc: new Date('2026-05-26T18:00:00Z'), // Tuesday 12h
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('WARNING suppressed when allowOvertimeWithWarning is false (still under max)', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CONFIRMED',
          shift: {
            startAtUtc: new Date('2026-05-25T15:00:00Z'),
            endAtUtc: new Date('2026-05-25T17:00:00Z'), // +2h → 10h total
            timezone: 'Asia/Jerusalem',
          },
        }),
      ],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// MAX-HOURS-WEEK — maxHoursPerWeek=45 (block), overtimeAfterWeeklyHours=42 (warn).
// projected = metrics.totalScheduledMinutes + shiftMinutes. monShift = 480 min.
// ───────────────────────────────────────────────────────────────────────────
describe('maxHoursWeekRule — boundaries (45h block / 42h overtime)', () => {
  it('PASS: projected exactly 42h = overtime threshold, not over (clean pass)', async () => {
    // 42h = 2520 min. shift 480 ⇒ existing 2040.
    const ctx = makeContext({
      shift: monShift(),
      metrics: makeMetrics({ totalScheduledMinutes: 2040 }),
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK_OK');
  });

  it('WARNING: projected 42h01m crosses the weekly overtime threshold', async () => {
    const ctx = makeContext({
      shift: monShift(),
      metrics: makeMetrics({ totalScheduledMinutes: 2041 }), // 2041+480=2521 > 2520
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('warning');
    expect(r.ruleCode).toBe('OVERTIME_WEEKLY');
    expect(r.metadata?.projectedMinutes).toBe(2521);
  });

  it('PASS: projected exactly 45h = weekly max, not over it (warning tier)', async () => {
    // 45h = 2700 min ⇒ existing 2220. Not > 2700 max, but > 2520 overtime ⇒ warning.
    const ctx = makeContext({
      shift: monShift(),
      metrics: makeMetrics({ totalScheduledMinutes: 2220 }),
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.ruleCode).toBe('OVERTIME_WEEKLY');
    expect(r.severity).toBe('warning');
  });

  it('FAIL/BLOCK: projected 45h01m exceeds the weekly max', async () => {
    const ctx = makeContext({
      shift: monShift(),
      metrics: makeMetrics({ totalScheduledMinutes: 2221 }), // 2221+480=2701 > 2700
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK');
    expect(r.metadata?.projectedMinutes).toBe(2701);
  });

  it('PASS: null metrics treated as zero prior minutes', async () => {
    const ctx = makeContext({ shift: monShift(), metrics: null });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK_OK');
  });

  it('BLOCK still fires even when allowOvertimeWithWarning is false', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      metrics: makeMetrics({ totalScheduledMinutes: 2221 }),
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK');
  });

  it('PASS: over-overtime but warnings disabled ⇒ clean pass (under max)', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      metrics: makeMetrics({ totalScheduledMinutes: 2220 }), // 45h, > 42h overtime
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AVAILABILITY — midnight-crossing windows, exact edges.
// ───────────────────────────────────────────────────────────────────────────
describe('availabilityRule — midnight & edges', () => {
  it('PASS: AVAILABLE window matches shift local bounds exactly (09:00–17:00)', async () => {
    const ctx = makeContext({
      shift: monShift(), // local 09:00–17:00 IDT
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '09:00:00',
          endLocalTime: '17:00:00',
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.metadata?.coverageRatio).toBe(1);
  });

  it('FAIL: window one minute short of shift end leaves a gap', async () => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '09:00:00',
          endLocalTime: '16:59:00',
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('AVAILABILITY_INSUFFICIENT');
  });

  it('PASS: night shift crossing midnight covered by two split-day rules', async () => {
    // Mon 19:00Z → Tue 03:00Z  ==  local Mon 22:00 → Tue 06:00 IDT
    const night = makeShift({
      startAtUtc: new Date('2026-05-25T19:00:00Z'),
      endAtUtc: new Date('2026-05-26T03:00:00Z'),
      timezone: 'Asia/Jerusalem',
    });
    const ctx = makeContext({
      shift: night,
      availabilityRules: [
        makeAvailability({ dayOfWeek: 1, startLocalTime: '22:00:00', endLocalTime: '23:59:59' }),
        makeAvailability({ dayOfWeek: 2, startLocalTime: '00:00:00', endLocalTime: '06:00:00' }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: midnight-crossing shift missing the Tuesday-head rule', async () => {
    const night = makeShift({
      startAtUtc: new Date('2026-05-25T19:00:00Z'),
      endAtUtc: new Date('2026-05-26T03:00:00Z'),
      timezone: 'Asia/Jerusalem',
    });
    const ctx = makeContext({
      shift: night,
      availabilityRules: [
        makeAvailability({ dayOfWeek: 1, startLocalTime: '22:00:00', endLocalTime: '23:59:59' }),
        // no dayOfWeek=2 rule → Tue head uncovered
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('AVAILABILITY_INSUFFICIENT');
  });

  it('FAIL: UNAVAILABLE window on the Tuesday head of a night shift blocks', async () => {
    const night = makeShift({
      startAtUtc: new Date('2026-05-25T19:00:00Z'),
      endAtUtc: new Date('2026-05-26T03:00:00Z'),
      timezone: 'Asia/Jerusalem',
    });
    const ctx = makeContext({
      shift: night,
      availabilityRules: [
        makeAvailability({ dayOfWeek: 1, startLocalTime: '22:00:00', endLocalTime: '23:59:59' }),
        makeAvailability({ dayOfWeek: 2, startLocalTime: '00:00:00', endLocalTime: '06:00:00' }),
        makeAvailability({
          dayOfWeek: 2,
          startLocalTime: '02:00:00',
          endLocalTime: '04:00:00',
          availabilityType: 'UNAVAILABLE',
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('AVAILABILITY_BLOCKED');
  });

  it('PASS: no availability rules ⇒ assumed fully available', async () => {
    const ctx = makeContext({ shift: monShift(), availabilityRules: [] });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('AVAILABILITY_OK');
    expect(r.metadata?.note).toBe('no_rules_defined');
  });

  it('PASS: requireAvailability=false skips evaluation even with partial window', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, requireAvailability: false },
      availabilityRules: [
        makeAvailability({ dayOfWeek: 1, startLocalTime: '09:00:00', endLocalTime: '10:00:00' }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('AVAILABILITY_SKIPPED');
  });

  it('FAIL: PREFERRED counts as coverage but partial window still insufficient', async () => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '09:00:00',
          endLocalTime: '13:00:00',
          availabilityType: 'PREFERRED',
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('failed');
    expect((r.metadata?.coverageRatio as number)).toBeLessThan(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EMPLOYEE-ACTIVE — inactive / wrong-org boundaries.
// ───────────────────────────────────────────────────────────────────────────
describe('employeeActiveRule — boundaries', () => {
  it('PASS: active employee in the same org', async () => {
    const ctx = makeContext({ shift: monShift(), employee: makeEmployee({ isActive: true }) });
    const r = await employeeActiveRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('EMPLOYEE_ACTIVE');
  });

  it('FAIL: inactive employee is blocked', async () => {
    const ctx = makeContext({ shift: monShift(), employee: makeEmployee({ isActive: false }) });
    const r = await employeeActiveRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('EMPLOYEE_INACTIVE');
  });

  it('FAIL: wrong-org takes precedence over active check', async () => {
    const ctx = makeContext({
      shift: monShift(),
      employee: makeEmployee({
        isActive: false,
        organizationId: '00000000-0000-0000-0000-0000000000ff',
      }),
    });
    const r = await employeeActiveRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('EMPLOYEE_WRONG_ORG');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SHIFT-NOT-LOCKED — lock ownership boundaries.
// ───────────────────────────────────────────────────────────────────────────
describe('shiftNotLockedRule — boundaries', () => {
  it('PASS: no active lock', async () => {
    const ctx = makeContext({ activeLockUserId: null, actingUserId: 'user-1' });
    const r = await shiftNotLockedRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('SHIFT_UNLOCKED');
  });

  it('PASS: lock held by the acting user themselves', async () => {
    const ctx = makeContext({ activeLockUserId: 'user-1', actingUserId: 'user-1' });
    const r = await shiftNotLockedRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('FAIL: lock held by a different user', async () => {
    const ctx = makeContext({ activeLockUserId: 'user-2', actingUserId: 'user-1' });
    const r = await shiftNotLockedRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('SHIFT_LOCKED');
    expect(r.metadata?.lockedBy).toBe('user-2');
  });
});
