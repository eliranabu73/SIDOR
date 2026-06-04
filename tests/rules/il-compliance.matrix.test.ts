/**
 * IL labour-law compliance — boundary MATRIX.
 *
 * Deterministic, table-driven boundary cases around every Israeli statutory
 * threshold enforced by src/modules/rules/rules/*. All wall-clock expectations
 * are pinned to FIXED calendar dates in Asia/Jerusalem.
 *
 * Timezone reference (verified against Luxon's IANA tz database):
 *   - June 2026  → IDT = UTC+3  (e.g. 04:00Z = 07:00 local)
 *   - January 2026 → IST = UTC+2 (e.g. 18:00Z = 20:00 local)
 *
 * 2026-06-01 = Monday, 2026-06-05 = Friday, 2026-06-06 = Saturday,
 * 2026-06-07 = Sunday, 2026-06-08 = Monday.
 *
 * Money/limit math is hand-computed with integer minutes; expected values are
 * NOT recomputed by calling the rule under test.
 */
import { maxHoursDayRule } from '../../src/modules/rules/rules/max-hours-day.rule';
import { maxHoursWeekRule } from '../../src/modules/rules/rules/max-hours-week.rule';
import { minRestRule } from '../../src/modules/rules/rules/min-rest.rule';
import { weeklyRest36hRule } from '../../src/modules/rules/rules/weekly-rest-36h.rule';
import { overtimeTiersRule } from '../../src/modules/rules/rules/overtime-tiers.rule';
import { consecutiveDaysMaxRule } from '../../src/modules/rules/rules/consecutive-days-max.rule';
import { holidayEveMaxHoursRule } from '../../src/modules/rules/rules/holiday-eve-max-hours.rule';
import { youthMaxHoursRule } from '../../src/modules/rules/rules/youth-max-hours.rule';
import { youthNightCurfewRule } from '../../src/modules/rules/rules/youth-night-curfew.rule';
import { pregnancyNightRule } from '../../src/modules/rules/rules/pregnancy-night.rule';
import { minWageCheckRule } from '../../src/modules/rules/rules/min-wage-check.rule';
import type {
  EmployeeWithRoles,
  RulesSnapshot,
  RuleResult,
} from '../../src/modules/rules/types';
import { SYSTEM_DEFAULT_RULES } from '../../src/modules/rules/types';
import {
  makeContext,
  makeEmployee,
  makeShift,
  makeAssignment,
  makeMetrics,
} from '../factories/fixtures';

const TZ = 'Asia/Jerusalem';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Build a candidate shift starting at a fixed UTC instant for `hours`. */
function shiftOf(startUtcIso: string, hours: number) {
  const start = new Date(startUtcIso);
  return makeShift({
    id: 'cand',
    startAtUtc: start,
    endAtUtc: new Date(start.getTime() + hours * HOUR),
    timezone: TZ,
  });
}

function asResult(r: RuleResult | Promise<RuleResult>): Promise<RuleResult> {
  return Promise.resolve(r);
}

// ===========================================================================
// 1. maxHoursDayRule — daily cap 12h (blocking) and OT after 8h (warning)
//    Defaults: maxHoursPerDay=12, overtimeAfterDailyHours=8,
//              allowOvertimeWithWarning=true.
// ===========================================================================
describe('maxHoursDayRule — daily caps', () => {
  // Single-day shifts starting 2026-06-01 07:00 IDT (04:00Z), no neighbours.
  const cases: Array<{ hours: number; code: string; status: string; sev: string }> = [
    { hours: 6, code: 'MAX_HOURS_PER_DAY_OK', status: 'passed', sev: 'info' },
    { hours: 8, code: 'MAX_HOURS_PER_DAY_OK', status: 'passed', sev: 'info' }, // exactly 8h = 480 == overtime threshold, NOT >
    { hours: 9, code: 'OVERTIME_DAILY', status: 'failed', sev: 'warning' }, // 540 > 480
    { hours: 10, code: 'OVERTIME_DAILY', status: 'failed', sev: 'warning' },
    { hours: 11.5, code: 'OVERTIME_DAILY', status: 'failed', sev: 'warning' }, // 690 ≤ 720
    { hours: 12, code: 'OVERTIME_DAILY', status: 'failed', sev: 'warning' }, // 720 == max, not > max → still OT
  ];
  for (const c of cases) {
    it(`${c.hours}h single-day → ${c.code}/${c.status}/${c.sev}`, async () => {
      const shift = shiftOf('2026-06-01T04:00:00Z', c.hours);
      const r = await asResult(maxHoursDayRule(makeContext({ shift })));
      expect(r.ruleCode).toBe(c.code);
      expect(r.status).toBe(c.status);
      expect(r.severity).toBe(c.sev);
    });
  }

  it('12h01m crosses the blocking cap (721 > 720)', async () => {
    const start = new Date('2026-06-01T04:00:00Z');
    const shift = makeShift({
      id: 'cand',
      startAtUtc: start,
      endAtUtc: new Date(start.getTime() + 12 * HOUR + 1 * MIN),
      timezone: TZ,
    });
    const r = await asResult(maxHoursDayRule(makeContext({ shift })));
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY');
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect((r.metadata as { totalMinutes: number }).totalMinutes).toBe(721);
    expect((r.metadata as { maxMinutes: number }).maxMinutes).toBe(720);
  });

  it('two same-day shifts (5h + 8h = 780) → blocking over 720', async () => {
    // candidate 07:00–12:00 IDT (5h), neighbour 13:00–21:00 IDT (8h), same local day.
    const shift = shiftOf('2026-06-01T04:00:00Z', 5); // 07:00–12:00 IDT
    const neighbour = makeAssignment({
      shift: {
        id: 'n1',
        startAtUtc: new Date('2026-06-01T10:00:00Z'), // 13:00 IDT
        endAtUtc: new Date('2026-06-01T18:00:00Z'), // 21:00 IDT
        timezone: TZ,
      },
    });
    const r = await asResult(
      maxHoursDayRule(makeContext({ shift, existingAssignments: [neighbour] })),
    );
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY');
    expect(r.severity).toBe('blocking');
    expect((r.metadata as { totalMinutes: number }).totalMinutes).toBe(780);
  });

  it('two same-day shifts (5h + 4h = 540) → OT warning, not blocking', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 5);
    const neighbour = makeAssignment({
      shift: {
        id: 'n2',
        startAtUtc: new Date('2026-06-01T10:00:00Z'), // 13:00 IDT
        endAtUtc: new Date('2026-06-01T14:00:00Z'), // 17:00 IDT, 4h
        timezone: TZ,
      },
    });
    const r = await asResult(
      maxHoursDayRule(makeContext({ shift, existingAssignments: [neighbour] })),
    );
    expect(r.ruleCode).toBe('OVERTIME_DAILY');
    expect(r.severity).toBe('warning');
    expect((r.metadata as { totalMinutes: number }).totalMinutes).toBe(540);
  });

  it('CANCELLED neighbour is ignored (5h candidate alone passes)', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 5);
    const cancelled = makeAssignment({
      assignmentStatus: 'CANCELLED',
      shift: {
        id: 'n3',
        startAtUtc: new Date('2026-06-01T10:00:00Z'),
        endAtUtc: new Date('2026-06-01T20:00:00Z'), // would be 10h if counted
        timezone: TZ,
      },
    });
    const r = await asResult(
      maxHoursDayRule(makeContext({ shift, existingAssignments: [cancelled] })),
    );
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
    expect(r.status).toBe('passed');
  });

  it('DECLINED neighbour is ignored', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 5);
    const declined = makeAssignment({
      assignmentStatus: 'DECLINED',
      shift: {
        id: 'n4',
        startAtUtc: new Date('2026-06-01T10:00:00Z'),
        endAtUtc: new Date('2026-06-01T20:00:00Z'),
        timezone: TZ,
      },
    });
    const r = await asResult(
      maxHoursDayRule(makeContext({ shift, existingAssignments: [declined] })),
    );
    expect(r.status).toBe('passed');
  });

  it('neighbour on a DIFFERENT local day is not aggregated', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 7); // 7h Mon
    const otherDay = makeAssignment({
      shift: {
        id: 'n5',
        startAtUtc: new Date('2026-06-02T04:00:00Z'), // Tue 07:00 IDT
        endAtUtc: new Date('2026-06-02T14:00:00Z'), // 10h Tue
        timezone: TZ,
      },
    });
    const r = await asResult(
      maxHoursDayRule(makeContext({ shift, existingAssignments: [otherDay] })),
    );
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
  });

  it('allowOvertimeWithWarning=false suppresses the 9h OT warning', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 9);
    const snap: RulesSnapshot = { ...SYSTEM_DEFAULT_RULES, allowOvertimeWithWarning: false };
    const r = await asResult(
      maxHoursDayRule(makeContext({ shift, rulesSnapshot: snap })),
    );
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MAX_HOURS_PER_DAY_OK');
  });
});

// ===========================================================================
// 2. maxHoursWeekRule — weekly cap 45h (blocking), OT after 42h (warning).
//    Defaults: maxHoursPerWeek=45 (2700m), overtimeAfterWeeklyHours=42 (2520m).
// ===========================================================================
describe('maxHoursWeekRule — weekly caps', () => {
  // candidate is a fixed 8h shift (480m). We vary metrics.totalScheduledMinutes.
  const SHIFT_MIN = 480;
  const cases: Array<{ already: number; code: string; status: string; sev: string }> = [
    { already: 0, code: 'MAX_HOURS_PER_WEEK_OK', status: 'passed', sev: 'info' }, // 480 ≤ 2520
    { already: 2040, code: 'MAX_HOURS_PER_WEEK_OK', status: 'passed', sev: 'info' }, // 2520 exactly == OT thr, not >
    { already: 2041, code: 'OVERTIME_WEEKLY', status: 'failed', sev: 'warning' }, // 2521 > 2520
    { already: 2220, code: 'OVERTIME_WEEKLY', status: 'failed', sev: 'warning' }, // 2700 == max, not > max → OT
    { already: 2221, code: 'MAX_HOURS_PER_WEEK', status: 'failed', sev: 'blocking' }, // 2701 > 2700
    { already: 3000, code: 'MAX_HOURS_PER_WEEK', status: 'failed', sev: 'blocking' },
  ];
  for (const c of cases) {
    it(`already=${c.already}m + 480m → ${c.code}/${c.sev}`, async () => {
      const shift = shiftOf('2026-06-01T04:00:00Z', SHIFT_MIN / 60);
      const metrics = makeMetrics({ totalScheduledMinutes: c.already });
      const r = await asResult(maxHoursWeekRule(makeContext({ shift, metrics })));
      expect(r.ruleCode).toBe(c.code);
      expect(r.status).toBe(c.status);
      expect(r.severity).toBe(c.sev);
    });
  }

  it('blocking metadata reports exact projected/max minutes', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 8); // 480m
    const metrics = makeMetrics({ totalScheduledMinutes: 2221 });
    const r = await asResult(maxHoursWeekRule(makeContext({ shift, metrics })));
    const m = r.metadata as {
      currentMinutes: number;
      shiftMinutes: number;
      projectedMinutes: number;
      maxMinutes: number;
    };
    expect(m.currentMinutes).toBe(2221);
    expect(m.shiftMinutes).toBe(480);
    expect(m.projectedMinutes).toBe(2701);
    expect(m.maxMinutes).toBe(2700);
  });

  it('null metrics treated as 0 prior minutes (8h passes)', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 8);
    const r = await asResult(maxHoursWeekRule(makeContext({ shift, metrics: null })));
    expect(r.status).toBe('passed');
  });

  it('allowOvertimeWithWarning=false suppresses weekly OT warning', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 8); // 480m
    const metrics = makeMetrics({ totalScheduledMinutes: 2041 }); // projected 2521
    const snap: RulesSnapshot = { ...SYSTEM_DEFAULT_RULES, allowOvertimeWithWarning: false };
    const r = await asResult(maxHoursWeekRule(makeContext({ shift, metrics, rulesSnapshot: snap })));
    expect(r.status).toBe('passed');
  });

  it('blocking still fires even when overtime warnings are disabled', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 8);
    const metrics = makeMetrics({ totalScheduledMinutes: 2221 }); // projected 2701
    const snap: RulesSnapshot = { ...SYSTEM_DEFAULT_RULES, allowOvertimeWithWarning: false };
    const r = await asResult(maxHoursWeekRule(makeContext({ shift, metrics, rulesSnapshot: snap })));
    expect(r.ruleCode).toBe('MAX_HOURS_PER_WEEK');
    expect(r.severity).toBe('blocking');
  });
});

// ===========================================================================
// 3. minRestRule — minimum rest between shifts (default 8h, blocking).
// ===========================================================================
describe('minRestRule — 8h rest between shifts', () => {
  // Candidate: 2026-06-02 08:00–16:00 UTC. Prior shift ends at varying gaps.
  const candStart = new Date('2026-06-02T08:00:00Z');
  const candEnd = new Date('2026-06-02T16:00:00Z');
  const candidate = makeShift({ id: 'cand', startAtUtc: candStart, endAtUtc: candEnd, timezone: TZ });

  const cases: Array<{ gapHours: number; status: string }> = [
    { gapHours: 7, status: 'failed' }, // 7h < 8h
    { gapHours: 7.5, status: 'failed' },
    { gapHours: 8, status: 'passed' }, // exactly 8h, not <
    { gapHours: 9, status: 'passed' },
    { gapHours: 12, status: 'passed' },
  ];
  for (const c of cases) {
    it(`prior shift ends ${c.gapHours}h before candidate → ${c.status}`, async () => {
      const priorEnd = new Date(candStart.getTime() - c.gapHours * HOUR);
      const priorStart = new Date(priorEnd.getTime() - 4 * HOUR);
      const prior = makeAssignment({
        shift: { id: 'prior', startAtUtc: priorStart, endAtUtc: priorEnd, timezone: TZ },
      });
      const r = await asResult(
        minRestRule(makeContext({ shift: candidate, existingAssignments: [prior] })),
      );
      expect(r.status).toBe(c.status);
      expect(r.ruleCode).toBe(c.status === 'failed' ? 'MIN_REST_BETWEEN_SHIFTS' : 'MIN_REST_OK');
    });
  }

  it('failure metadata reports exact actual/required rest hours', async () => {
    const priorEnd = new Date(candStart.getTime() - 7 * HOUR);
    const prior = makeAssignment({
      shift: {
        id: 'prior',
        startAtUtc: new Date(priorEnd.getTime() - 4 * HOUR),
        endAtUtc: priorEnd,
        timezone: TZ,
      },
    });
    const r = await asResult(
      minRestRule(makeContext({ shift: candidate, existingAssignments: [prior] })),
    );
    const m = r.metadata as { requiredRestHours: number; actualRestHours: number; neighborShiftId: string };
    expect(m.requiredRestHours).toBe(8);
    expect(m.actualRestHours).toBe(7);
    expect(m.neighborShiftId).toBe('prior');
    expect(r.severity).toBe('blocking');
  });

  it('rest measured to NEXT shift after candidate (5h gap → fail)', async () => {
    const nextStart = new Date(candEnd.getTime() + 5 * HOUR);
    const next = makeAssignment({
      shift: {
        id: 'next',
        startAtUtc: nextStart,
        endAtUtc: new Date(nextStart.getTime() + 4 * HOUR),
        timezone: TZ,
      },
    });
    const r = await asResult(
      minRestRule(makeContext({ shift: candidate, existingAssignments: [next] })),
    );
    expect(r.status).toBe('failed');
    expect((r.metadata as { neighborShiftId: string }).neighborShiftId).toBe('next');
  });

  it('closest neighbour wins when one is tight and one is loose', async () => {
    const tightEnd = new Date(candStart.getTime() - 6 * HOUR); // 6h before
    const looseEnd = new Date(candStart.getTime() - 20 * HOUR); // 20h before
    const tight = makeAssignment({
      shift: { id: 'tight', startAtUtc: new Date(tightEnd.getTime() - HOUR), endAtUtc: tightEnd, timezone: TZ },
    });
    const loose = makeAssignment({
      shift: { id: 'loose', startAtUtc: new Date(looseEnd.getTime() - HOUR), endAtUtc: looseEnd, timezone: TZ },
    });
    const r = await asResult(
      minRestRule(makeContext({ shift: candidate, existingAssignments: [loose, tight] })),
    );
    expect(r.status).toBe('failed');
    expect((r.metadata as { neighborShiftId: string }).neighborShiftId).toBe('tight');
  });

  it('overlapping neighbour is skipped by min-rest (handled by overlap rule)', async () => {
    const overlap = makeAssignment({
      shift: {
        id: 'ov',
        startAtUtc: new Date('2026-06-02T10:00:00Z'), // inside candidate window
        endAtUtc: new Date('2026-06-02T12:00:00Z'),
        timezone: TZ,
      },
    });
    const r = await asResult(
      minRestRule(makeContext({ shift: candidate, existingAssignments: [overlap] })),
    );
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('MIN_REST_OK');
  });

  it('CANCELLED prior shift is ignored', async () => {
    const priorEnd = new Date(candStart.getTime() - 2 * HOUR);
    const prior = makeAssignment({
      assignmentStatus: 'CANCELLED',
      shift: { id: 'prior', startAtUtc: new Date(priorEnd.getTime() - HOUR), endAtUtc: priorEnd, timezone: TZ },
    });
    const r = await asResult(
      minRestRule(makeContext({ shift: candidate, existingAssignments: [prior] })),
    );
    expect(r.status).toBe('passed');
  });

  it('custom snapshot minRest=11h fails a 10h gap that 8h would pass', async () => {
    const priorEnd = new Date(candStart.getTime() - 10 * HOUR);
    const prior = makeAssignment({
      shift: { id: 'prior', startAtUtc: new Date(priorEnd.getTime() - HOUR), endAtUtc: priorEnd, timezone: TZ },
    });
    const snap: RulesSnapshot = { ...SYSTEM_DEFAULT_RULES, minRestHoursBetweenShifts: 11 };
    const r = await asResult(
      minRestRule(makeContext({ shift: candidate, existingAssignments: [prior], rulesSnapshot: snap })),
    );
    expect(r.status).toBe('failed');
    expect((r.metadata as { requiredRestHours: number }).requiredRestHours).toBe(11);
    expect((r.metadata as { actualRestHours: number }).actualRestHours).toBe(10);
  });
});

// ===========================================================================
// 4. overtimeTiersRule — informational tier split (8h/10h boundaries).
//    REGULAR_MINUTES=480, TIER_125_MINUTES=600. Always passes/info.
// ===========================================================================
describe('overtimeTiersRule — 100/125/150 tier split', () => {
  const cases: Array<{ hours: number; reg: number; t125: number; t150: number }> = [
    { hours: 6, reg: 360, t125: 0, t150: 0 }, // ≤ 8h branch: regularMinutes == shiftMinutes
    { hours: 8, reg: 480, t125: 0, t150: 0 }, // exactly 8h, still ≤ branch
    { hours: 9, reg: 480, t125: 60, t150: 0 }, // 540: 60m in 125 tier
    { hours: 10, reg: 480, t125: 120, t150: 0 }, // 600: full 2h tier-125, none 150
    { hours: 11, reg: 480, t125: 120, t150: 60 }, // 660: 120 @125, 60 @150
    { hours: 12.5, reg: 480, t125: 120, t150: 150 }, // 750: 120 @125, 150 @150
  ];
  for (const c of cases) {
    it(`${c.hours}h → reg=${c.reg} t125=${c.t125} t150=${c.t150}`, async () => {
      const shift = shiftOf('2026-06-01T04:00:00Z', c.hours);
      const r = await asResult(overtimeTiersRule(makeContext({ shift })));
      expect(r.status).toBe('passed');
      expect(r.severity).toBe('info');
      expect(r.ruleCode).toBe('OVERTIME_TIERS');
      const m = r.metadata as { regularMinutes: number; tier125Minutes: number; tier150Minutes: number };
      expect(m.regularMinutes).toBe(c.reg);
      expect(m.tier125Minutes).toBe(c.t125);
      expect(m.tier150Minutes).toBe(c.t150);
    });
  }

  it('exactly-8h boundary stays in the no-overtime branch (regularMinutes=480)', async () => {
    const shift = shiftOf('2026-06-01T04:00:00Z', 8);
    const r = await asResult(overtimeTiersRule(makeContext({ shift })));
    const m = r.metadata as { regularMinutes: number; tier125Minutes: number; tier150Minutes: number };
    expect(m.regularMinutes).toBe(480);
    expect(m.tier125Minutes).toBe(0);
  });
});

// ===========================================================================
// 5. consecutiveDaysMaxRule — max 6 consecutive days (blocking on 7th).
// ===========================================================================
describe('consecutiveDaysMaxRule — 6-day run boundary', () => {
  function priorRun(count: number, startIso: string) {
    const start = new Date(startIso);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start.getTime() + i * 24 * HOUR);
      return makeAssignment({
        shift: {
          startAtUtc: d,
          endAtUtc: new Date(d.getTime() + 8 * HOUR),
          timezone: TZ,
        },
      });
    });
  }

  const cases: Array<{ prior: number; candIso: string; run: number; status: string }> = [
    // prior days 2026-06-01..., candidate is the next day.
    { prior: 0, candIso: '2026-06-01T05:00:00Z', run: 1, status: 'passed' },
    { prior: 4, candIso: '2026-06-05T05:00:00Z', run: 5, status: 'passed' },
    { prior: 5, candIso: '2026-06-06T05:00:00Z', run: 6, status: 'passed' }, // 6 == max
    { prior: 6, candIso: '2026-06-07T05:00:00Z', run: 7, status: 'failed' }, // 7 > 6
    // NOTE: the rule only walks back maxDays(6) days from the candidate, so a
    // candidate on 06-08 with priors 06-01..06-07 reports run=7 (cap), not 8.
    { prior: 7, candIso: '2026-06-08T05:00:00Z', run: 7, status: 'failed' },
  ];
  for (const c of cases) {
    it(`${c.prior} prior days + candidate → run=${c.run} → ${c.status}`, async () => {
      const priors = priorRun(c.prior, '2026-06-01T05:00:00Z');
      const candidate = makeShift({
        id: 'cand',
        startAtUtc: new Date(c.candIso),
        endAtUtc: new Date(new Date(c.candIso).getTime() + 8 * HOUR),
        timezone: TZ,
      });
      const r = await asResult(
        consecutiveDaysMaxRule(makeContext({ shift: candidate, existingAssignments: priors })),
      );
      expect(r.status).toBe(c.status);
      expect(r.ruleCode).toBe('CONSECUTIVE_DAYS_MAX');
      if (c.status === 'failed') {
        expect(r.severity).toBe('blocking');
        expect((r.metadata as { consecutiveDays: number }).consecutiveDays).toBe(c.run);
        expect((r.metadata as { maxConsecutiveWorkDays: number }).maxConsecutiveWorkDays).toBe(6);
      } else {
        expect(r.severity).toBe('info');
      }
    });
  }

  it('a gap day breaks the run (candidate is isolated → run=1 pass)', async () => {
    // prior days 06-01..06-05 (5 days), candidate on 06-07 (skipping 06-06).
    const priors = priorRun(5, '2026-06-01T05:00:00Z');
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-07T05:00:00Z'),
      endAtUtc: new Date('2026-06-07T13:00:00Z'),
      timezone: TZ,
    });
    const r = await asResult(
      consecutiveDaysMaxRule(makeContext({ shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('passed');
  });

  it('candidate in the MIDDLE bridges two runs (3 before + 3 after = 7 → fail)', async () => {
    // prior: 06-01,06-02,06-03 and 06-05,06-06,06-07 ; candidate 06-04 bridges → 7.
    const before = priorRun(3, '2026-06-01T05:00:00Z');
    const after = priorRun(3, '2026-06-05T05:00:00Z');
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-04T05:00:00Z'),
      endAtUtc: new Date('2026-06-04T13:00:00Z'),
      timezone: TZ,
    });
    const r = await asResult(
      consecutiveDaysMaxRule(
        makeContext({ shift: candidate, existingAssignments: [...before, ...after] }),
      ),
    );
    expect(r.status).toBe('failed');
    expect((r.metadata as { consecutiveDays: number }).consecutiveDays).toBe(7);
  });

  it('CANCELLED prior days do not count toward the run', async () => {
    const priors = priorRun(6, '2026-06-01T05:00:00Z').map((a) => ({
      ...a,
      assignmentStatus: 'CANCELLED' as const,
    }));
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-07T05:00:00Z'),
      endAtUtc: new Date('2026-06-07T13:00:00Z'),
      timezone: TZ,
    });
    const r = await asResult(
      consecutiveDaysMaxRule(makeContext({ shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('passed');
  });

  it('duplicate assignments on the same prior day count once', async () => {
    // Two assignments on each of 06-01..06-06, candidate 06-07 → still run=7.
    const day = (iso: string) =>
      makeAssignment({
        shift: { startAtUtc: new Date(iso), endAtUtc: new Date(new Date(iso).getTime() + 4 * HOUR), timezone: TZ },
      });
    const priors = [
      day('2026-06-01T05:00:00Z'), day('2026-06-01T12:00:00Z'),
      day('2026-06-02T05:00:00Z'), day('2026-06-02T12:00:00Z'),
      day('2026-06-03T05:00:00Z'),
      day('2026-06-04T05:00:00Z'),
      day('2026-06-05T05:00:00Z'),
      day('2026-06-06T05:00:00Z'),
    ];
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-07T05:00:00Z'),
      endAtUtc: new Date('2026-06-07T13:00:00Z'),
      timezone: TZ,
    });
    const r = await asResult(
      consecutiveDaysMaxRule(makeContext({ shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('failed');
    expect((r.metadata as { consecutiveDays: number }).consecutiveDays).toBe(7);
  });

  it('custom snapshot maxConsecutiveWorkDays=5 fails a 6-day run', async () => {
    const priors = priorRun(5, '2026-06-01T05:00:00Z');
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-06T05:00:00Z'),
      endAtUtc: new Date('2026-06-06T13:00:00Z'),
      timezone: TZ,
    });
    const snap: RulesSnapshot = { ...SYSTEM_DEFAULT_RULES, maxConsecutiveWorkDays: 5 };
    const r = await asResult(
      consecutiveDaysMaxRule(makeContext({ shift: candidate, existingAssignments: priors, rulesSnapshot: snap })),
    );
    expect(r.status).toBe('failed');
    expect((r.metadata as { consecutiveDays: number }).consecutiveDays).toBe(6);
    expect((r.metadata as { maxConsecutiveWorkDays: number }).maxConsecutiveWorkDays).toBe(5);
  });
});

// ===========================================================================
// 6. holidayEveMaxHoursRule — Friday 7h cap (warning). Only Fridays apply.
//    2026-06-05 = Friday. Times pinned to IDT (UTC+3).
// ===========================================================================
describe('holidayEveMaxHoursRule — Friday 7h cap', () => {
  const friday0700Z = '2026-06-05T04:00:00Z'; // 07:00 IDT Fri
  const cases: Array<{ hours: number; status: string }> = [
    { hours: 5, status: 'passed' },
    { hours: 6, status: 'passed' },
    { hours: 7, status: 'passed' }, // exactly 7h = 420m, not > 420
    { hours: 8, status: 'failed' }, // 480 > 420
    { hours: 10, status: 'failed' },
  ];
  for (const c of cases) {
    it(`Friday ${c.hours}h → ${c.status}`, async () => {
      const shift = shiftOf(friday0700Z, c.hours);
      const r = await asResult(holidayEveMaxHoursRule(makeContext({ shift })));
      expect(r.status).toBe(c.status);
      expect(r.ruleCode).toBe('HOLIDAY_EVE_MAX_HOURS');
      if (c.status === 'failed') expect(r.severity).toBe('warning');
    });
  }

  it('7h01m crosses the cap (421 > 420)', async () => {
    const start = new Date(friday0700Z);
    const shift = makeShift({
      id: 'cand',
      startAtUtc: start,
      endAtUtc: new Date(start.getTime() + 7 * HOUR + MIN),
      timezone: TZ,
    });
    const r = await asResult(holidayEveMaxHoursRule(makeContext({ shift })));
    expect(r.status).toBe('failed');
    const m = r.metadata as { shiftMinutes: number; maxMinutes: number; dayOfWeek: string };
    expect(m.shiftMinutes).toBe(421);
    expect(m.maxMinutes).toBe(420);
    expect(m.dayOfWeek).toBe('Friday');
  });

  const otherDays: Array<{ iso: string; label: string }> = [
    { iso: '2026-06-06T04:00:00Z', label: 'Saturday' },
    { iso: '2026-06-07T04:00:00Z', label: 'Sunday' },
    { iso: '2026-06-08T04:00:00Z', label: 'Monday' },
    { iso: '2026-06-04T04:00:00Z', label: 'Thursday' },
  ];
  for (const d of otherDays) {
    it(`${d.label} 10h shift passes (rule is Friday-only)`, async () => {
      const shift = shiftOf(d.iso, 10);
      const r = await asResult(holidayEveMaxHoursRule(makeContext({ shift })));
      expect(r.status).toBe('passed');
      expect(r.severity).toBe('info');
    });
  }

  it('Thursday 23:00 IDT shift that crosses into Friday is keyed on START day (Thu) → passes', async () => {
    // 2026-06-04 20:00Z = 23:00 IDT Thursday; +9h ends Fri 08:00 IDT.
    const start = new Date('2026-06-04T20:00:00Z');
    const shift = makeShift({
      id: 'cand',
      startAtUtc: start,
      endAtUtc: new Date(start.getTime() + 9 * HOUR),
      timezone: TZ,
    });
    const r = await asResult(holidayEveMaxHoursRule(makeContext({ shift })));
    expect(r.status).toBe('passed'); // start weekday is Thursday(4), not 5
  });
});

// ===========================================================================
// 7. youthMaxHoursRule — age<18: 8h/day, 40h/week (blocking). ≥18 skipped.
// ===========================================================================
describe('youthMaxHoursRule — minor daily/weekly caps', () => {
  // Reference shift start: 2026-06-01 (Mon). DOB pins exact age.
  const minorDob = new Date('2010-06-01T00:00:00Z'); // turns 16 on 2026-06-01
  const adultDob = new Date('2005-01-01T00:00:00Z'); // 21 at shift date

  const dailyCases: Array<{ hours: number; status: string; code: string }> = [
    { hours: 6, status: 'passed', code: 'YOUTH_MAX_HOURS' },
    { hours: 8, status: 'passed', code: 'YOUTH_MAX_HOURS' }, // 480 == cap, not >
    { hours: 9, status: 'failed', code: 'YOUTH_MAX_HOURS_DAY' }, // 540 > 480
    { hours: 10, status: 'failed', code: 'YOUTH_MAX_HOURS_DAY' },
  ];
  for (const c of dailyCases) {
    it(`minor ${c.hours}h/day → ${c.code}/${c.status}`, async () => {
      const emp = makeEmployee({ dateOfBirth: minorDob } as Partial<EmployeeWithRoles>);
      const shift = shiftOf('2026-06-01T04:00:00Z', c.hours);
      const r = await asResult(youthMaxHoursRule(makeContext({ employee: emp, shift })));
      expect(r.status).toBe(c.status);
      expect(r.ruleCode).toBe(c.code);
      if (c.status === 'failed') expect(r.severity).toBe('blocking');
    });
  }

  it('minor 9h/day failure reports ageYears=16 and 540 minutes', async () => {
    const emp = makeEmployee({ dateOfBirth: minorDob } as Partial<EmployeeWithRoles>);
    const shift = shiftOf('2026-06-01T04:00:00Z', 9);
    const r = await asResult(youthMaxHoursRule(makeContext({ employee: emp, shift })));
    const m = r.metadata as { ageYears: number; totalMinutes: number; maxMinutes: number };
    expect(m.ageYears).toBe(16);
    expect(m.totalMinutes).toBe(540);
    expect(m.maxMinutes).toBe(480);
  });

  it('exactly-18 employee at shift date is treated as adult and skipped', async () => {
    // DOB 2008-06-01 → exactly 18 on 2026-06-01 → ageYears 18 → skip.
    const emp = makeEmployee({ dateOfBirth: new Date('2008-06-01T00:00:00Z') } as Partial<EmployeeWithRoles>);
    const shift = shiftOf('2026-06-01T04:00:00Z', 11); // would fail if treated as minor
    const r = await asResult(youthMaxHoursRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('YOUTH_MAX_HOURS');
  });

  it('adult (21) with 12h shift is skipped (passes)', async () => {
    const emp = makeEmployee({ dateOfBirth: adultDob } as Partial<EmployeeWithRoles>);
    const shift = shiftOf('2026-06-01T04:00:00Z', 12);
    const r = await asResult(youthMaxHoursRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
  });

  it('no DOB → youth check skipped (passes with note)', async () => {
    const emp = makeEmployee({ dateOfBirth: null } as Partial<EmployeeWithRoles>);
    const shift = shiftOf('2026-06-01T04:00:00Z', 12);
    const r = await asResult(youthMaxHoursRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('YOUTH_MAX_HOURS');
  });

  it('minor weekly cap: 35h prior + 6h candidate = 41h > 40h → weekly fail', async () => {
    // Candidate 6h on Wed 2026-06-03; prior 35h spread same Sun-anchored week.
    const emp = makeEmployee({ dateOfBirth: minorDob } as Partial<EmployeeWithRoles>);
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-03T04:00:00Z'), // Wed 07:00 IDT
      endAtUtc: new Date('2026-06-03T10:00:00Z'), // 6h
      timezone: TZ,
    });
    // 35h = e.g. five 7h shifts on Sun..Thu of the same week (06-01..). Avoid same-day-as-candidate
    // to keep daily cap clear: put them on 05-31(Sun),06-01,06-02,06-04,06-05.
    const days = ['2026-05-31', '2026-06-01', '2026-06-02', '2026-06-04', '2026-06-05'];
    const priors = days.map((d) =>
      makeAssignment({
        shift: {
          startAtUtc: new Date(`${d}T04:00:00Z`),
          endAtUtc: new Date(`${d}T11:00:00Z`), // 7h each
          timezone: TZ,
        },
      }),
    );
    const r = await asResult(
      youthMaxHoursRule(makeContext({ employee: emp, shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('YOUTH_MAX_HOURS_WEEK');
    const m = r.metadata as { projectedMinutes: number; maxMinutes: number };
    expect(m.projectedMinutes).toBe(35 * 60 + 6 * 60); // 2460
    expect(m.maxMinutes).toBe(40 * 60);
  });

  it('minor weekly cap boundary: 34h prior + 6h candidate = 40h exactly → pass', async () => {
    const emp = makeEmployee({ dateOfBirth: minorDob } as Partial<EmployeeWithRoles>);
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-03T04:00:00Z'),
      endAtUtc: new Date('2026-06-03T10:00:00Z'), // 6h
      timezone: TZ,
    });
    // 34h = four 7h + one 6h on five distinct other days.
    const priors = [
      ['2026-05-31', 7], ['2026-06-01', 7], ['2026-06-02', 7], ['2026-06-04', 7], ['2026-06-05', 6],
    ].map(([d, h]) =>
      makeAssignment({
        shift: {
          startAtUtc: new Date(`${d}T04:00:00Z`),
          endAtUtc: new Date(new Date(`${d}T04:00:00Z`).getTime() + (h as number) * HOUR),
          timezone: TZ,
        },
      }),
    );
    const r = await asResult(
      youthMaxHoursRule(makeContext({ employee: emp, shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('YOUTH_MAX_HOURS');
  });
});

// ===========================================================================
// 8. youthNightCurfewRule — under-16: 20:00 all days; 16-17: 20:00 school
//    days (Sun-Thu) / 22:00 Fri-Sat. ≥18 skipped.
// ===========================================================================
describe('youthNightCurfewRule — minor night curfew', () => {
  const under16Dob = new Date('2012-01-01T00:00:00Z'); // 14 in 2026
  const teen16Dob = new Date('2009-06-01T00:00:00Z'); // turns 17 on 2026-06-01
  const adultDob = new Date('2000-01-01T00:00:00Z');

  // ---- under-16: 20:00 curfew on EVERY day ----
  it('under-16 Thursday ending 20:30 IDT → fail (20:00 curfew, school day)', async () => {
    // 2026-06-04 Thursday. 17:30Z = 20:30 IDT.
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-04T14:00:00Z'), // 17:00 IDT
      endAtUtc: new Date('2026-06-04T17:30:00Z'), // 20:30 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: under16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    const m = r.metadata as { curfewHour: number; under16: boolean; isSchoolDay: boolean };
    expect(m.curfewHour).toBe(20);
    expect(m.under16).toBe(true);
    expect(m.isSchoolDay).toBe(true);
  });

  it('under-16 Friday ending 20:30 IDT → fail (20:00 even on non-school day)', async () => {
    // 2026-06-05 Friday (non-school). Under-16 still capped at 20:00.
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-05T14:00:00Z'),
      endAtUtc: new Date('2026-06-05T17:30:00Z'), // 20:30 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: under16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('failed');
    const m = r.metadata as { curfewHour: number; under16: boolean; isSchoolDay: boolean };
    expect(m.curfewHour).toBe(20);
    expect(m.under16).toBe(true);
    expect(m.isSchoolDay).toBe(false);
  });

  it('under-16 ending exactly 20:00 IDT → pass (not strictly after)', async () => {
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-04T14:00:00Z'),
      endAtUtc: new Date('2026-06-04T17:00:00Z'), // 20:00 IDT exactly
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: under16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
  });

  // ---- 16-17: 20:00 school days, 22:00 Fri/Sat ----
  it('age-17 Sunday ending 20:30 IDT → fail (school day 20:00 curfew)', async () => {
    // 2026-06-07 Sunday (school day per rule). 17:30Z = 20:30 IDT.
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-07T14:00:00Z'),
      endAtUtc: new Date('2026-06-07T17:30:00Z'), // 20:30 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: teen16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('failed');
    const m = r.metadata as { curfewHour: number; under16: boolean; isSchoolDay: boolean };
    expect(m.curfewHour).toBe(20);
    expect(m.under16).toBe(false);
    expect(m.isSchoolDay).toBe(true);
  });

  it('age-17 Friday ending 21:00 IDT → pass (22:00 curfew on non-school)', async () => {
    // 2026-06-05 Friday. 18:00Z = 21:00 IDT < 22:00.
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-05T15:00:00Z'), // 18:00 IDT
      endAtUtc: new Date('2026-06-05T18:00:00Z'), // 21:00 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: teen16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
  });

  it('age-17 Friday ending 22:30 IDT → fail (past 22:00 non-school curfew)', async () => {
    // 2026-06-05 Friday. 19:30Z = 22:30 IDT > 22:00.
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-05T16:00:00Z'), // 19:00 IDT
      endAtUtc: new Date('2026-06-05T19:30:00Z'), // 22:30 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: teen16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('failed');
    expect((r.metadata as { curfewHour: number }).curfewHour).toBe(22);
    expect((r.metadata as { isSchoolDay: boolean }).isSchoolDay).toBe(false);
  });

  it('age-17 Saturday ending 21:45 IDT → pass (22:00 non-school curfew)', async () => {
    // 2026-06-06 Saturday. 18:45Z = 21:45 IDT.
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-06T15:00:00Z'),
      endAtUtc: new Date('2026-06-06T18:45:00Z'), // 21:45 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: teen16Dob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
  });

  it('adult (26) ending 23:30 IDT Friday → pass (curfew not applicable)', async () => {
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-05T17:00:00Z'),
      endAtUtc: new Date('2026-06-05T20:30:00Z'), // 23:30 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: adultDob } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('YOUTH_NIGHT_CURFEW');
  });

  it('no DOB → curfew skipped', async () => {
    const shift = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-05T17:00:00Z'),
      endAtUtc: new Date('2026-06-05T20:30:00Z'),
      timezone: TZ,
    });
    const emp = makeEmployee({ dateOfBirth: null } as Partial<EmployeeWithRoles>);
    const r = await asResult(youthNightCurfewRule(makeContext({ employee: emp, shift })));
    expect(r.status).toBe('passed');
  });
});

// ===========================================================================
// 9. pregnancyNightRule — night = overlaps 22:00–06:00. From week 20 block;
//    isPregnant but weeks null → warning; weeks<20 → warning; not pregnant pass.
// ===========================================================================
describe('pregnancyNightRule — night-work restriction tiers', () => {
  // Night shift 22:30 IDT (19:30Z) → 06:00+1 IDT (03:00Z next day).
  const nightShift = makeShift({
    id: 'night',
    startAtUtc: new Date('2026-06-01T19:30:00Z'),
    endAtUtc: new Date('2026-06-02T03:00:00Z'),
    timezone: TZ,
  });
  // Day shift fully inside daytime: 09:00–17:00 IDT (06:00Z–14:00Z).
  const dayShift = makeShift({
    id: 'day',
    startAtUtc: new Date('2026-06-01T06:00:00Z'),
    endAtUtc: new Date('2026-06-01T14:00:00Z'),
    timezone: TZ,
  });

  const weekCases: Array<{ weeks: number | null; sev: string; status: string }> = [
    { weeks: 25, sev: 'blocking', status: 'failed' },
    { weeks: 20, sev: 'blocking', status: 'failed' }, // exactly week 20 blocks
    { weeks: 19, sev: 'warning', status: 'failed' }, // under 20 → warn
    { weeks: 5, sev: 'warning', status: 'failed' },
    { weeks: null, sev: 'warning', status: 'failed' }, // unknown week → warn
  ];
  for (const c of weekCases) {
    it(`pregnant week=${c.weeks ?? 'null'} on night shift → ${c.sev}`, async () => {
      const emp = makeEmployee({
        isPregnant: true,
        pregnancyWeeks: c.weeks,
      } as Partial<EmployeeWithRoles>);
      const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: nightShift })));
      expect(r.status).toBe(c.status);
      expect(r.severity).toBe(c.sev);
      expect(r.ruleCode).toBe('PREGNANCY_NIGHT');
    });
  }

  it('week 20 blocking metadata reports restrictionFromWeek=20', async () => {
    const emp = makeEmployee({ isPregnant: true, pregnancyWeeks: 20 } as Partial<EmployeeWithRoles>);
    const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: nightShift })));
    const m = r.metadata as { pregnancyWeeks: number; restrictionFromWeek: number };
    expect(m.pregnancyWeeks).toBe(20);
    expect(m.restrictionFromWeek).toBe(20);
  });

  it('not pregnant on night shift → pass', async () => {
    const emp = makeEmployee({ isPregnant: false, pregnancyWeeks: 30 } as Partial<EmployeeWithRoles>);
    const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: nightShift })));
    expect(r.status).toBe('passed');
  });

  it('pregnant week=30 on a DAY shift → pass (not night work)', async () => {
    const emp = makeEmployee({ isPregnant: true, pregnancyWeeks: 30 } as Partial<EmployeeWithRoles>);
    const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: dayShift })));
    expect(r.status).toBe('passed');
  });

  it('pregnant week=30 shift ending exactly 22:00 IDT → pass (does not overlap night)', async () => {
    // 15:00Z–19:00Z = 18:00–22:00 IDT. endLocal == nightStart, not strictly after.
    const edge = makeShift({
      id: 'edge',
      startAtUtc: new Date('2026-06-01T15:00:00Z'),
      endAtUtc: new Date('2026-06-01T19:00:00Z'),
      timezone: TZ,
    });
    const emp = makeEmployee({ isPregnant: true, pregnancyWeeks: 30 } as Partial<EmployeeWithRoles>);
    const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: edge })));
    expect(r.status).toBe('passed');
  });

  it('pregnant week=30 shift ending 22:01 IDT → blocking (overlaps night by 1m)', async () => {
    const start = new Date('2026-06-01T15:00:00Z'); // 18:00 IDT
    const edge = makeShift({
      id: 'edge2',
      startAtUtc: start,
      endAtUtc: new Date('2026-06-01T19:01:00Z'), // 22:01 IDT
      timezone: TZ,
    });
    const emp = makeEmployee({ isPregnant: true, pregnancyWeeks: 30 } as Partial<EmployeeWithRoles>);
    const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: edge })));
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
  });

  it('early-morning shift 04:00–10:00 IDT → pass (night window is start-day 22:00→06:00+1, no overlap)', async () => {
    // 01:00Z–07:00Z = 04:00–10:00 IDT. The rule anchors the night window on the
    // shift START day: nightStart=22:00 (this day), nightEnd=06:00 (next day).
    // A 04:00 start is < nightEnd but its end (10:00) is NOT > nightStart(22:00),
    // so it is NOT classified as a night shift → passes even for a pregnant week-25
    // employee. (To catch a pre-06:00 morning shift the rule would need a previous-
    // day night window; documenting current behaviour here.)
    const morning = makeShift({
      id: 'morn',
      startAtUtc: new Date('2026-06-01T01:00:00Z'),
      endAtUtc: new Date('2026-06-01T07:00:00Z'),
      timezone: TZ,
    });
    const emp = makeEmployee({ isPregnant: true, pregnancyWeeks: 25 } as Partial<EmployeeWithRoles>);
    const r = await asResult(pregnancyNightRule(makeContext({ employee: emp, shift: morning })));
    expect(r.status).toBe('passed');
  });
});

// ===========================================================================
// 10. minWageCheckRule — ₪35.40/h minimum (warning below).
// ===========================================================================
describe('minWageCheckRule — ₪35.40/h floor', () => {
  const cases: Array<{ rate: number | null; status: string }> = [
    { rate: 30, status: 'failed' },
    { rate: 35, status: 'failed' }, // 35 < 35.40
    { rate: 35.39, status: 'failed' },
    { rate: 35.4, status: 'passed' }, // exactly the floor, not <
    { rate: 35.41, status: 'passed' },
    { rate: 40, status: 'passed' },
    { rate: null, status: 'passed' }, // no rate on file
  ];
  for (const c of cases) {
    it(`hourlyRate=${c.rate ?? 'null'} → ${c.status}`, async () => {
      const emp = { ...makeEmployee(), hourlyRate: c.rate } as unknown as EmployeeWithRoles;
      const r = await asResult(minWageCheckRule(makeContext({ employee: emp })));
      expect(r.status).toBe(c.status);
      expect(r.ruleCode).toBe('MIN_WAGE_CHECK');
      if (c.status === 'failed') expect(r.severity).toBe('warning');
    });
  }

  it('below-min metadata reports exact rate and floor', async () => {
    const emp = { ...makeEmployee(), hourlyRate: 30 } as unknown as EmployeeWithRoles;
    const r = await asResult(minWageCheckRule(makeContext({ employee: emp })));
    const m = r.metadata as { employeeHourlyRate: number; minWagePerHour: number; effectiveFrom: string };
    expect(m.employeeHourlyRate).toBe(30);
    expect(m.minWagePerHour).toBe(35.4);
    expect(m.effectiveFrom).toBe('2026-04-01');
  });
});

// ===========================================================================
// 11. weeklyRest36hRule — needs a continuous ≥36h gap covering the weekly
//     rest day (default SATURDAY). Sunday-anchored local week.
//     Week of interest: Sun 2026-05-31 .. Sun 2026-06-07; rest day Sat 06-06.
// ===========================================================================
describe('weeklyRest36hRule — 36h gap around rest day', () => {
  it('empty week (only a short Sun shift) → pass (huge gap covers Saturday)', async () => {
    // Candidate Sun 2026-05-31 09:00–13:00 IDT (06:00Z–10:00Z), nothing else.
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-31T06:00:00Z'),
      endAtUtc: new Date('2026-05-31T10:00:00Z'),
      timezone: TZ,
    });
    const emp = makeEmployee({ weeklyRestDay: 'SATURDAY' } as Partial<EmployeeWithRoles>);
    const r = await asResult(
      weeklyRest36hRule(makeContext({ employee: emp, shift: candidate, existingAssignments: [] })),
    );
    expect(r.status).toBe('passed');
    expect(r.ruleCode).toBe('WEEKLY_REST_36H');
  });

  it('shifts every day Sun-Fri ending by Fri 12:00 IDT but Saturday free → pass (exactly 36h gap)', async () => {
    // Candidate Sun 05-31 morning. Mon..Fri 3h shifts 09:00–12:00 IDT (06:00Z–09:00Z).
    // Friday ends 12:00 IDT; week ends Sun 06-07 00:00 IDT → continuous gap = 36h,
    // which covers Saturday 06-06 and meets the ≥36h requirement exactly.
    const emp = makeEmployee({ weeklyRestDay: 'SATURDAY' } as Partial<EmployeeWithRoles>);
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-31T06:00:00Z'), // Sun 09:00 IDT
      endAtUtc: new Date('2026-05-31T09:00:00Z'),
      timezone: TZ,
    });
    const weekdayShift = (d: string) =>
      makeAssignment({
        shift: {
          startAtUtc: new Date(`${d}T06:00:00Z`), // 09:00 IDT
          endAtUtc: new Date(`${d}T09:00:00Z`), // 12:00 IDT
          timezone: TZ,
        },
      });
    const priors = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].map(weekdayShift);
    const r = await asResult(
      weeklyRest36hRule(makeContext({ employee: emp, shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('passed');
  });

  it('back-to-back coverage spanning the rest day collapses the gap below 36h → blocking', async () => {
    // Candidate on Saturday itself, plus shifts Fri evening through Sun morning
    // so no 36h continuous gap overlaps Sat. Use long shifts to crush the gaps.
    const emp = makeEmployee({ weeklyRestDay: 'SATURDAY' } as Partial<EmployeeWithRoles>);
    // Candidate: Sat 2026-06-06 06:00Z–18:00Z (09:00–21:00 IDT) — 12h on the rest day.
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-06T06:00:00Z'),
      endAtUtc: new Date('2026-06-06T18:00:00Z'),
      timezone: TZ,
    });
    // Surrounding shifts: Fri 06-05 long, Sat early, Sun 06-07 — leave only small gaps near Sat.
    const priors = [
      makeAssignment({ shift: { startAtUtc: new Date('2026-06-05T05:00:00Z'), endAtUtc: new Date('2026-06-05T22:00:00Z'), timezone: TZ } }), // Fri 08:00–01:00+1 IDT
      makeAssignment({ shift: { startAtUtc: new Date('2026-06-06T20:00:00Z'), endAtUtc: new Date('2026-06-06T23:30:00Z'), timezone: TZ } }), // Sat 23:00–02:30 IDT
      makeAssignment({ shift: { startAtUtc: new Date('2026-06-07T03:00:00Z'), endAtUtc: new Date('2026-06-07T12:00:00Z'), timezone: TZ } }), // Sun 06:00–15:00 IDT
    ];
    const r = await asResult(
      weeklyRest36hRule(makeContext({ employee: emp, shift: candidate, existingAssignments: priors })),
    );
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('WEEKLY_REST_36H');
    expect((r.metadata as { restDay: string }).restDay).toBe('SATURDAY');
    expect((r.metadata as { requiredHours: number }).requiredHours).toBe(36);
  });

  it('SUNDAY rest-day employee: free Sunday yields a pass', async () => {
    // weeklyRestDay SUNDAY → rest day is week-start Sun 2026-05-31.
    // Candidate is a Tuesday shift; Sunday entirely free → big gap covers it.
    const emp = makeEmployee({ weeklyRestDay: 'SUNDAY' } as Partial<EmployeeWithRoles>);
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-02T06:00:00Z'), // Tue 09:00 IDT
      endAtUtc: new Date('2026-06-02T10:00:00Z'),
      timezone: TZ,
    });
    const r = await asResult(
      weeklyRest36hRule(makeContext({ employee: emp, shift: candidate, existingAssignments: [] })),
    );
    expect(r.status).toBe('passed');
  });

  it('CANCELLED surrounding shifts do not crush the rest gap → pass', async () => {
    const emp = makeEmployee({ weeklyRestDay: 'SATURDAY' } as Partial<EmployeeWithRoles>);
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-06-06T06:00:00Z'),
      endAtUtc: new Date('2026-06-06T10:00:00Z'), // Sat 09:00–13:00 IDT, 4h
      timezone: TZ,
    });
    const priors = [
      makeAssignment({ assignmentStatus: 'CANCELLED', shift: { startAtUtc: new Date('2026-06-05T05:00:00Z'), endAtUtc: new Date('2026-06-05T22:00:00Z'), timezone: TZ } }),
      makeAssignment({ assignmentStatus: 'DECLINED', shift: { startAtUtc: new Date('2026-06-07T03:00:00Z'), endAtUtc: new Date('2026-06-07T12:00:00Z'), timezone: TZ } }),
    ];
    const r = await asResult(
      weeklyRest36hRule(makeContext({ employee: emp, shift: candidate, existingAssignments: priors })),
    );
    // Only a 4h Sat shift counts; the rest of the week is free → ≥36h gap exists.
    expect(r.status).toBe('passed');
  });
});
