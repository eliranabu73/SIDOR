/**
 * Rules-engine BOUNDARY MATRICES — table-driven (describe.each / it.each).
 *
 * Timezone pin: Asia/Jerusalem in June 2026 is IDT = UTC+3 (verified: the
 * instant 2026-06-08T06:00:00Z renders local 2026-06-08T09:00:00+03:00, a
 * Monday, weekday=1). Every UTC instant below is chosen so the local-day
 * arithmetic is trivial: local = UTC + 3h.
 *
 * Canonical summer Monday candidate shift ("monShift"):
 *   06:00Z → 14:00Z  ==  local Mon 09:00 → 17:00 IDT  (8h = 480 min), dayOfWeek=1.
 *
 * Threshold semantics (read from source, NOT recomputed):
 *  - timeOffRule / overlapRule use HALF-OPEN/STRICT overlap: touching (==) does
 *    NOT overlap; 1 minute past does. PENDING|APPROVED time-off blocks;
 *    PROPOSED|CONFIRMED|COMPLETED assignments overlap.
 *  - minRestRule: gap < minRestMs ⇒ FAIL. Exact threshold ⇒ PASS. Default 8h.
 *  - maxHoursDayRule: dayMinutes > maxMinutes(12h=720) ⇒ BLOCK; else
 *    dayMinutes > overtimeMinutes(8h=480) && allowOvertimeWithWarning ⇒ WARNING.
 *    Strict >, so EXACTLY at a threshold is on the PASS side of that threshold.
 *  - maxHoursWeekRule: projected = metrics.totalScheduledMinutes + shiftMinutes.
 *    projected > 45h(2700) ⇒ BLOCK; projected > 42h(2520) ⇒ WARNING.
 *  - availabilityRule: coverageRatio<1 ⇒ INSUFFICIENT; any UNAVAILABLE overlap ⇒
 *    BLOCKED (checked first). Empty rules ⇒ OK. requireAvailability=false ⇒ SKIP.
 *
 * All expectations below are HAND-COMPUTED from these literal rules; derived
 * arithmetic is shown inline in comments.
 */
import { timeOffRule } from '../../src/modules/rules/rules/time-off.rule';
import { overlapRule } from '../../src/modules/rules/rules/overlap.rule';
import { minRestRule } from '../../src/modules/rules/rules/min-rest.rule';
import { maxHoursDayRule } from '../../src/modules/rules/rules/max-hours-day.rule';
import { maxHoursWeekRule } from '../../src/modules/rules/rules/max-hours-week.rule';
import { availabilityRule } from '../../src/modules/rules/rules/availability.rule';
import {
  makeAssignment,
  makeAvailability,
  makeContext,
  makeMetrics,
  makeShift,
  makeTimeOff,
} from '../factories/fixtures';
import type { ValidationContext } from '../../src/modules/rules/types';
import { SYSTEM_DEFAULT_RULES } from '../../src/modules/rules/types';
import type { AssignmentStatus } from '@prisma/client';

const TZ = 'Asia/Jerusalem';
// Summer Monday candidate: local Mon 09:00→17:00 IDT (UTC+3) = 06:00Z→14:00Z.
const MON_START = '2026-06-08T06:00:00Z';
const MON_END = '2026-06-08T14:00:00Z';
const monShift = () =>
  makeShift({
    startAtUtc: new Date(MON_START),
    endAtUtc: new Date(MON_END),
    timezone: TZ,
  });

type Status = 'passed' | 'failed';
type Severity = 'info' | 'warning' | 'blocking';

// helpers to build neighbour assignments at given UTC instants
const activeShiftAt = (startZ: string, endZ: string, status: AssignmentStatus = 'CONFIRMED') =>
  makeAssignment({
    assignmentStatus: status,
    shift: {
      startAtUtc: new Date(startZ),
      endAtUtc: new Date(endZ),
      timezone: TZ,
    },
  });

// ════════════════════════════════════════════════════════════════════════════
// TIME-OFF MATRIX — window grid around the [06:00Z,14:00Z) shift, ×3 statuses.
// Overlap iff shift.start < req.end && req.start < shift.end.
// ════════════════════════════════════════════════════════════════════════════
describe('timeOffRule — window × status matrix', () => {
  type Row = {
    name: string;
    reqStart: string;
    reqEnd: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    expected: Status;
  };
  // For PENDING/APPROVED these depend on geometry; REJECTED/CANCELLED always pass.
  const geomRows: Array<Omit<Row, 'status' | 'expected'> & { overlaps: boolean }> = [
    // touching at start: req ends exactly 06:00Z ⇒ 06:00 < 06:00 false ⇒ no overlap
    { name: 'ends exactly at shift start', reqStart: '2026-06-08T00:00:00Z', reqEnd: '2026-06-08T06:00:00Z', overlaps: false },
    // 1-min overlap at start: req ends 06:01Z ⇒ 06:00 < 06:01 true
    { name: 'ends 1 min after shift start', reqStart: '2026-06-08T00:00:00Z', reqEnd: '2026-06-08T06:01:00Z', overlaps: true },
    // touching at end: req starts exactly 14:00Z ⇒ 14:00 < 14:00 false ⇒ no overlap
    { name: 'starts exactly at shift end', reqStart: '2026-06-08T14:00:00Z', reqEnd: '2026-06-08T20:00:00Z', overlaps: false },
    // 1-min overlap at end: req starts 13:59Z ⇒ 13:59 < 14:00 true
    { name: 'starts 1 min before shift end', reqStart: '2026-06-08T13:59:00Z', reqEnd: '2026-06-08T20:00:00Z', overlaps: true },
    // fully contained
    { name: 'fully inside shift', reqStart: '2026-06-08T10:00:00Z', reqEnd: '2026-06-08T11:00:00Z', overlaps: true },
    // fully covers shift
    { name: 'fully covers shift', reqStart: '2026-06-08T00:00:00Z', reqEnd: '2026-06-08T23:00:00Z', overlaps: true },
    // entirely before, 2h gap
    { name: 'entirely before (2h gap)', reqStart: '2026-06-08T00:00:00Z', reqEnd: '2026-06-08T04:00:00Z', overlaps: false },
    // entirely after, 2h gap
    { name: 'entirely after (2h gap)', reqStart: '2026-06-08T16:00:00Z', reqEnd: '2026-06-08T20:00:00Z', overlaps: false },
  ];

  const rows: Row[] = [];
  for (const g of geomRows) {
    // PENDING + APPROVED block iff geometry overlaps
    rows.push({ name: `${g.name} [PENDING]`, reqStart: g.reqStart, reqEnd: g.reqEnd, status: 'PENDING', expected: g.overlaps ? 'failed' : 'passed' });
    rows.push({ name: `${g.name} [APPROVED]`, reqStart: g.reqStart, reqEnd: g.reqEnd, status: 'APPROVED', expected: g.overlaps ? 'failed' : 'passed' });
    // REJECTED + CANCELLED never block regardless of geometry
    rows.push({ name: `${g.name} [REJECTED]`, reqStart: g.reqStart, reqEnd: g.reqEnd, status: 'REJECTED', expected: 'passed' });
    rows.push({ name: `${g.name} [CANCELLED]`, reqStart: g.reqStart, reqEnd: g.reqEnd, status: 'CANCELLED', expected: 'passed' });
  }

  it.each(rows)('$name → $expected', async ({ reqStart, reqEnd, status, expected }) => {
    const ctx = makeContext({
      shift: monShift(),
      timeOffRequests: [
        makeTimeOff({ status, startAtUtc: new Date(reqStart), endAtUtc: new Date(reqEnd) }),
      ],
    });
    const r = await timeOffRule(ctx);
    expect(r.status).toBe(expected);
    if (expected === 'failed') {
      expect(r.ruleCode).toBe('TIME_OFF_BLOCKED');
      expect(r.severity).toBe('blocking');
    } else {
      expect(r.ruleCode).toBe('TIME_OFF_OK');
      expect(r.severity).toBe('info');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// OVERLAP MATRIX — interval grid × assignment status.
// intervalsOverlap strict: touching ≠ overlap. Active = PROPOSED|CONFIRMED|COMPLETED.
// ════════════════════════════════════════════════════════════════════════════
describe('overlapRule — interval × status matrix', () => {
  type Geom = { name: string; startZ: string; endZ: string; overlaps: boolean };
  const geoms: Geom[] = [
    { name: 'ends exactly at candidate start (touch)', startZ: '2026-06-08T00:00:00Z', endZ: '2026-06-08T06:00:00Z', overlaps: false },
    { name: 'ends 1 min into candidate', startZ: '2026-06-08T00:00:00Z', endZ: '2026-06-08T06:01:00Z', overlaps: true },
    { name: 'starts exactly at candidate end (touch)', startZ: '2026-06-08T14:00:00Z', endZ: '2026-06-08T18:00:00Z', overlaps: false },
    { name: 'starts 1 min before candidate end', startZ: '2026-06-08T13:59:00Z', endZ: '2026-06-08T18:00:00Z', overlaps: true },
    { name: 'fully contained inside candidate', startZ: '2026-06-08T10:00:00Z', endZ: '2026-06-08T11:00:00Z', overlaps: true },
    { name: 'candidate contained inside it', startZ: '2026-06-08T00:00:00Z', endZ: '2026-06-08T20:00:00Z', overlaps: true },
    { name: 'identical window', startZ: '2026-06-08T06:00:00Z', endZ: '2026-06-08T14:00:00Z', overlaps: true },
    { name: 'entirely before (1h gap)', startZ: '2026-06-08T00:00:00Z', endZ: '2026-06-08T05:00:00Z', overlaps: false },
    { name: 'entirely after (1h gap)', startZ: '2026-06-08T15:00:00Z', endZ: '2026-06-08T18:00:00Z', overlaps: false },
  ];
  const activeStatuses = ['PROPOSED', 'CONFIRMED', 'COMPLETED'] as const;
  const inactiveStatuses = ['CANCELLED', 'DECLINED'] as const;

  type Row = { name: string; startZ: string; endZ: string; status: string; expected: Status };
  const rows: Row[] = [];
  for (const g of geoms) {
    for (const s of activeStatuses) {
      rows.push({ name: `${g.name} [${s}]`, startZ: g.startZ, endZ: g.endZ, status: s, expected: g.overlaps ? 'failed' : 'passed' });
    }
    for (const s of inactiveStatuses) {
      // inactive statuses never conflict regardless of geometry
      rows.push({ name: `${g.name} [${s}]`, startZ: g.startZ, endZ: g.endZ, status: s, expected: 'passed' });
    }
  }

  it.each(rows)('$name → $expected', async ({ startZ, endZ, status, expected }) => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [activeShiftAt(startZ, endZ, status as AssignmentStatus)],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe(expected);
    if (expected === 'failed') {
      expect(r.ruleCode).toBe('SHIFT_OVERLAP');
      expect(r.severity).toBe('blocking');
      expect((r.metadata?.conflictingShiftIds as string[]).length).toBe(1);
    } else {
      expect(r.ruleCode).toBe('NO_OVERLAP');
      expect(r.severity).toBe('info');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MIN-REST MATRIX — required hours {6,8,12} × prior-gap grid (-2h..+2h around
// each threshold), BOTH backward (prior shift before) and forward (next shift).
// gap < requiredMs ⇒ FAIL. Candidate starts 06:00Z, ends 14:00Z.
// ════════════════════════════════════════════════════════════════════════════
describe('minRestRule — required-hours × gap matrix', () => {
  // Backward neighbour: a 1h prior shift ending at (06:00Z - gap).
  // gap in minutes; expected FAIL iff gap < required*60.
  type Row = {
    name: string;
    requiredHours: number;
    gapMinutes: number;
    direction: 'backward' | 'forward';
    expected: Status;
  };
  const requiredSet = [6, 8, 12];
  // gap offsets around each threshold: -120,-60,-1,0,+1,+60,+120 minutes
  const offsets = [-120, -60, -1, 0, 1, 60, 120];

  const rows: Row[] = [];
  for (const req of requiredSet) {
    const reqMin = req * 60;
    for (const off of offsets) {
      const gap = reqMin + off; // actual gap in minutes
      // FAIL iff gap < reqMin  ⇔  off < 0
      const expected: Status = off < 0 ? 'failed' : 'passed';
      rows.push({ name: `req=${req}h gap=${gap}m backward`, requiredHours: req, gapMinutes: gap, direction: 'backward', expected });
      rows.push({ name: `req=${req}h gap=${gap}m forward`, requiredHours: req, gapMinutes: gap, direction: 'forward', expected });
    }
  }

  const candidateStartMs = new Date(MON_START).getTime();
  const candidateEndMs = new Date(MON_END).getTime();

  it.each(rows)('$name → $expected', async ({ requiredHours, gapMinutes, direction, expected }) => {
    const base = makeContext();
    let neighbour;
    if (direction === 'backward') {
      // prior shift ends at candidateStart - gap, lasts 1h before that
      const end = candidateStartMs - gapMinutes * 60_000;
      const start = end - 60 * 60_000;
      neighbour = activeShiftAt(new Date(start).toISOString(), new Date(end).toISOString());
    } else {
      // next shift starts at candidateEnd + gap, lasts 1h
      const start = candidateEndMs + gapMinutes * 60_000;
      const end = start + 60 * 60_000;
      neighbour = activeShiftAt(new Date(start).toISOString(), new Date(end).toISOString());
    }
    const ctx: ValidationContext = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, minRestHoursBetweenShifts: requiredHours },
      existingAssignments: [neighbour],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe(expected);
    if (expected === 'failed') {
      expect(r.ruleCode).toBe('MIN_REST_BETWEEN_SHIFTS');
      expect(r.severity).toBe('blocking');
      expect(r.metadata?.requiredRestHours).toBe(requiredHours);
      // actualRestHours = gapMinutes/60 (gap is exact since neighbours don't overlap)
      expect(r.metadata?.actualRestHours).toBeCloseTo(gapMinutes / 60, 5);
    } else {
      expect(r.ruleCode).toBe('MIN_REST_OK');
      expect(r.severity).toBe('info');
    }
  });

  // Inactive neighbours with a tiny gap must be ignored (CANCELLED/DECLINED).
  it.each(['CANCELLED', 'DECLINED'])('inactive %s neighbour with 1h gap is ignored → passed', async (status) => {
    // prior shift ends 1h before candidate start (gap=60m < 8h) but inactive
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [activeShiftAt('2026-06-08T04:00:00Z', '2026-06-08T05:00:00Z', status as AssignmentStatus)],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MIN_REST_OK');
  });

  it('overlapping neighbour is skipped by min-rest (overlapRule owns it) → passed', async () => {
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [activeShiftAt('2026-06-08T10:00:00Z', '2026-06-08T12:00:00Z')],
    });
    const r = await minRestRule(ctx);
    expect(r.status).toBe('passed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MAX-HOURS-DAY MATRIX — minute grid around 8h overtime + 12h block.
// Candidate monShift = 480 min (8h). Add a same-local-Monday neighbour of
// `extraMinutes` so dayTotal = 480 + extra. Strict > comparisons:
//   total > 720(12h) ⇒ BLOCK; else total > 480(8h) ⇒ WARNING (allowOT default true).
// ════════════════════════════════════════════════════════════════════════════
describe('maxHoursDayRule — daily minute grid', () => {
  type Row = { extraMinutes: number; total: number; expectedCode: string; expectedStatus: Status; expectedSeverity: Severity };
  // total = 480 + extra. Build grid that crosses 480 and 720.
  // Neighbour starts 15:00Z (local 18:00 Mon); must end by 24:00 local (21:00Z)
  // to stay on Monday, so max extra is 360 min (avoids midnight spillover).
  const extras = [0, 1, 2, 60, 239, 240, 241, 300];
  const rows: Row[] = extras.map((extra) => {
    const total = 480 + extra;
    let expectedCode: string;
    let expectedStatus: Status;
    let expectedSeverity: Severity;
    if (total > 720) {
      // 12h block. e.g. extra=241 ⇒ 721 > 720
      expectedCode = 'MAX_HOURS_PER_DAY';
      expectedStatus = 'failed';
      expectedSeverity = 'blocking';
    } else if (total > 480) {
      // overtime warning. e.g. extra=1 ⇒ 481 > 480
      expectedCode = 'OVERTIME_DAILY';
      expectedStatus = 'failed';
      expectedSeverity = 'warning';
    } else {
      // exactly 480 (extra=0) ⇒ not > 480 ⇒ clean pass
      expectedCode = 'MAX_HOURS_PER_DAY_OK';
      expectedStatus = 'passed';
      expectedSeverity = 'info';
    }
    return { extraMinutes: extra, total, expectedCode, expectedStatus, expectedSeverity };
  });

  it.each(rows)('extra=$extraMinutes ⇒ total=$total → $expectedCode', async ({ extraMinutes, total, expectedCode, expectedStatus, expectedSeverity }) => {
    // neighbour same Monday starting 15:00Z (local 18:00) for extraMinutes
    const neighbours =
      extraMinutes === 0
        ? []
        : [activeShiftAt('2026-06-08T15:00:00Z', new Date(new Date('2026-06-08T15:00:00Z').getTime() + extraMinutes * 60_000).toISOString())];
    const ctx = makeContext({ shift: monShift(), existingAssignments: neighbours });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe(expectedStatus);
    expect(r.ruleCode).toBe(expectedCode);
    expect(r.severity).toBe(expectedSeverity);
    if (expectedCode === 'MAX_HOURS_PER_DAY') {
      expect(r.metadata?.totalMinutes).toBe(total);
      expect(r.metadata?.maxMinutes).toBe(720);
    }
  });

  it('neighbour on a DIFFERENT local day does not count → passed', async () => {
    // 12h Tuesday shift (06:00Z→18:00Z next day) must not affect Monday total.
    const ctx = makeContext({
      shift: monShift(),
      existingAssignments: [activeShiftAt('2026-06-09T06:00:00Z', '2026-06-09T18:00:00Z')],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
  });

  it('overtime suppressed when allowOvertimeWithWarning=false (still < max) → clean pass', async () => {
    const base = makeContext();
    // total = 480 + 120 = 600 (10h): > 8h overtime, < 12h max ⇒ would warn, but OT off
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      existingAssignments: [activeShiftAt('2026-06-08T15:00:00Z', '2026-06-08T17:00:00Z')],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
  });

  it('BLOCK still fires even when allowOvertimeWithWarning=false', async () => {
    const base = makeContext();
    // total = 480 + 241 = 721 > 720 ⇒ block regardless of OT flag
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      existingAssignments: [activeShiftAt('2026-06-08T15:00:00Z', new Date(new Date('2026-06-08T15:00:00Z').getTime() + 241 * 60_000).toISOString())],
    });
    const r = await maxHoursDayRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MAX-HOURS-WEEK MATRIX — projected = prior + 480 around 42h(2520)/45h(2700).
// ════════════════════════════════════════════════════════════════════════════
describe('maxHoursWeekRule — weekly minute grid', () => {
  type Row = { prior: number; projected: number; expectedCode: string; expectedStatus: Status; expectedSeverity: Severity };
  // projected = prior + 480. Pick priors so projected lands around 2520 and 2700.
  // 2520-480=2040 (42h edge); 2700-480=2220 (45h edge).
  const priors = [
    2039, // 2519: <42h ⇒ pass
    2040, // 2520: ==42h, not >2520 ⇒ pass
    2041, // 2521: >2520 ⇒ warn
    2100, // 2580: warn
    2219, // 2699: warn (<2700)
    2220, // 2700: ==45h, not >2700 ⇒ warn
    2221, // 2701: >2700 ⇒ block
    2400, // 2880: block
  ];
  const rows: Row[] = priors.map((prior) => {
    const projected = prior + 480;
    let expectedCode: string;
    let expectedStatus: Status;
    let expectedSeverity: Severity;
    if (projected > 2700) {
      expectedCode = 'MAX_HOURS_PER_WEEK';
      expectedStatus = 'failed';
      expectedSeverity = 'blocking';
    } else if (projected > 2520) {
      expectedCode = 'OVERTIME_WEEKLY';
      expectedStatus = 'failed';
      expectedSeverity = 'warning';
    } else {
      expectedCode = 'MAX_HOURS_PER_WEEK_OK';
      expectedStatus = 'passed';
      expectedSeverity = 'info';
    }
    return { prior, projected, expectedCode, expectedStatus, expectedSeverity };
  });

  it.each(rows)('prior=$prior ⇒ projected=$projected → $expectedCode', async ({ prior, projected, expectedCode, expectedStatus, expectedSeverity }) => {
    const ctx = makeContext({
      shift: monShift(),
      metrics: makeMetrics({ totalScheduledMinutes: prior }),
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe(expectedStatus);
    expect(r.ruleCode).toBe(expectedCode);
    expect(r.severity).toBe(expectedSeverity);
    if (expectedStatus === 'failed') {
      expect(r.metadata?.projectedMinutes).toBe(projected);
    }
  });

  it('null metrics ⇒ projected = 480 only → passed', async () => {
    const ctx = makeContext({ shift: monShift(), metrics: null });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK_OK');
  });

  it('BLOCK fires even with allowOvertimeWithWarning=false', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      metrics: makeMetrics({ totalScheduledMinutes: 2400 }), // 2880 > 2700
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK');
  });

  it('over-overtime but warnings disabled ⇒ clean pass (< max)', async () => {
    const base = makeContext();
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...base.rulesSnapshot, allowOvertimeWithWarning: false },
      metrics: makeMetrics({ totalScheduledMinutes: 2220 }), // 2700: >42h OT, ==45h max
    });
    const r = await maxHoursWeekRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK_OK');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AVAILABILITY MATRIX — coverage windows on the local Mon 09:00→17:00 shift,
// plus a midnight-crossing night shift split across two local days.
// ════════════════════════════════════════════════════════════════════════════
describe('availabilityRule — daytime coverage grid', () => {
  // Shift local window: 09:00 → 17:00 (dayOfWeek=1). 480 min total.
  type Row = { name: string; start: string; end: string; type?: string; expectedCode: string; expectedStatus: Status };
  const rows: Row[] = [
    // exact match ⇒ full coverage
    { name: 'exact 09:00-17:00 AVAILABLE', start: '09:00:00', end: '17:00:00', expectedCode: 'AVAILABILITY_OK', expectedStatus: 'passed' },
    // superset ⇒ full coverage
    { name: 'superset 06:00-23:00 AVAILABLE', start: '06:00:00', end: '23:00:00', expectedCode: 'AVAILABILITY_OK', expectedStatus: 'passed' },
    // 1 min short at end ⇒ insufficient
    { name: '09:00-16:59 leaves 1-min gap', start: '09:00:00', end: '16:59:00', expectedCode: 'AVAILABILITY_INSUFFICIENT', expectedStatus: 'failed' },
    // 1 min short at start ⇒ insufficient
    { name: '09:01-17:00 leaves 1-min gap', start: '09:01:00', end: '17:00:00', expectedCode: 'AVAILABILITY_INSUFFICIENT', expectedStatus: 'failed' },
    // half coverage ⇒ insufficient
    { name: '09:00-13:00 half window', start: '09:00:00', end: '13:00:00', expectedCode: 'AVAILABILITY_INSUFFICIENT', expectedStatus: 'failed' },
    // PREFERRED counts as coverage; exact ⇒ full
    { name: 'exact 09:00-17:00 PREFERRED', start: '09:00:00', end: '17:00:00', type: 'PREFERRED', expectedCode: 'AVAILABILITY_OK', expectedStatus: 'passed' },
    // PREFERRED but partial ⇒ insufficient
    { name: 'partial 09:00-13:00 PREFERRED', start: '09:00:00', end: '13:00:00', type: 'PREFERRED', expectedCode: 'AVAILABILITY_INSUFFICIENT', expectedStatus: 'failed' },
    // window entirely outside the shift ⇒ zero coverage ⇒ insufficient
    { name: 'window 18:00-22:00 outside shift', start: '18:00:00', end: '22:00:00', expectedCode: 'AVAILABILITY_INSUFFICIENT', expectedStatus: 'failed' },
  ];

  it.each(rows)('$name → $expectedCode', async ({ start, end, type, expectedCode, expectedStatus }) => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: start,
          endLocalTime: end,
          ...(type ? { availabilityType: type as 'AVAILABLE' | 'PREFERRED' | 'UNAVAILABLE' } : {}),
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe(expectedStatus);
    expect(r.ruleCode).toBe(expectedCode);
    if (expectedCode === 'AVAILABILITY_OK') {
      expect(r.metadata?.coverageRatio).toBe(1);
    } else {
      expect(r.metadata?.coverageRatio as number).toBeLessThan(1);
    }
  });

  // UNAVAILABLE overlapping any part ⇒ BLOCKED (checked before coverage<1).
  type UnavRow = { name: string; start: string; end: string; blocks: boolean };
  const unavRows: UnavRow[] = [
    { name: 'UNAVAILABLE 11:00-12:00 inside shift', start: '11:00:00', end: '12:00:00', blocks: true },
    { name: 'UNAVAILABLE 09:00-17:00 covers shift', start: '09:00:00', end: '17:00:00', blocks: true },
    // touches only at the start edge: overlapMinutes(540,1020, 480,540)=0 ⇒ no block
    { name: 'UNAVAILABLE 08:00-09:00 touches start edge', start: '08:00:00', end: '09:00:00', blocks: false },
    // touches only at the end edge: overlapMinutes(540,1020,1020,1080)=0 ⇒ no block
    { name: 'UNAVAILABLE 17:00-18:00 touches end edge', start: '17:00:00', end: '18:00:00', blocks: false },
  ];

  it.each(unavRows)('$name → blocks=$blocks', async ({ start, end, blocks }) => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        // full AVAILABLE window so coverage alone would pass
        makeAvailability({ dayOfWeek: 1, startLocalTime: '09:00:00', endLocalTime: '17:00:00' }),
        makeAvailability({ dayOfWeek: 1, startLocalTime: start, endLocalTime: end, availabilityType: 'UNAVAILABLE' }),
      ],
    });
    const r = await availabilityRule(ctx);
    if (blocks) {
      expect(r.status).toBe('failed');
      expect(r.ruleCode).toBe('AVAILABILITY_BLOCKED');
      expect(r.severity).toBe('blocking');
    } else {
      expect(r.status).toBe('passed');
      expect(r.ruleCode).toBe('AVAILABILITY_OK');
    }
  });

  it('no availability rules ⇒ assumed fully available → AVAILABILITY_OK', async () => {
    const ctx = makeContext({ shift: monShift(), availabilityRules: [] });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('AVAILABILITY_OK');
    expect(r.metadata?.note).toBe('no_rules_defined');
  });

  it('requireAvailability=false skips evaluation even with partial window → SKIPPED', async () => {
    const ctx = makeContext({
      shift: monShift(),
      rulesSnapshot: { ...SYSTEM_DEFAULT_RULES, requireAvailability: false },
      availabilityRules: [makeAvailability({ dayOfWeek: 1, startLocalTime: '09:00:00', endLocalTime: '10:00:00' })],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('AVAILABILITY_SKIPPED');
  });
});

describe('availabilityRule — midnight-crossing night shift', () => {
  // Night shift: 19:00Z Mon → 03:00Z Tue == local Mon 22:00 → Tue 06:00 IDT.
  // Splits into Mon[22:00-24:00]=120min (dayOfWeek=1) + Tue[00:00-06:00]=360min (dayOfWeek=2).
  const night = () =>
    makeShift({
      startAtUtc: new Date('2026-06-08T19:00:00Z'),
      endAtUtc: new Date('2026-06-09T03:00:00Z'),
      timezone: TZ,
    });

  type Row = { name: string; rules: Array<{ d: number; s: string; e: string; t?: string }>; expectedCode: string; expectedStatus: Status };
  const rows: Row[] = [
    {
      name: 'both halves covered',
      rules: [
        { d: 1, s: '22:00:00', e: '23:59:59' },
        { d: 2, s: '00:00:00', e: '06:00:00' },
      ],
      expectedCode: 'AVAILABILITY_OK',
      expectedStatus: 'passed',
    },
    {
      name: 'missing Tuesday head ⇒ insufficient',
      rules: [{ d: 1, s: '22:00:00', e: '23:59:59' }],
      expectedCode: 'AVAILABILITY_INSUFFICIENT',
      expectedStatus: 'failed',
    },
    {
      name: 'missing Monday tail ⇒ insufficient',
      rules: [{ d: 2, s: '00:00:00', e: '06:00:00' }],
      expectedCode: 'AVAILABILITY_INSUFFICIENT',
      expectedStatus: 'failed',
    },
    {
      name: 'UNAVAILABLE on Tuesday head ⇒ blocked',
      rules: [
        { d: 1, s: '22:00:00', e: '23:59:59' },
        { d: 2, s: '00:00:00', e: '06:00:00' },
        { d: 2, s: '02:00:00', e: '04:00:00', t: 'UNAVAILABLE' },
      ],
      expectedCode: 'AVAILABILITY_BLOCKED',
      expectedStatus: 'failed',
    },
  ];

  it.each(rows)('$name → $expectedCode', async ({ rules, expectedCode, expectedStatus }) => {
    const ctx = makeContext({
      shift: night(),
      availabilityRules: rules.map((rr) =>
        makeAvailability({
          dayOfWeek: rr.d,
          startLocalTime: rr.s,
          endLocalTime: rr.e,
          ...(rr.t ? { availabilityType: rr.t as 'AVAILABLE' | 'PREFERRED' | 'UNAVAILABLE' } : {}),
        }),
      ),
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe(expectedStatus);
    expect(r.ruleCode).toBe(expectedCode);
  });
});
