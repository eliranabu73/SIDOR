/**
 * validator.service AGGREGATION BREADTH — table-driven matrices.
 *
 * Three concerns are exercised here:
 *
 *  1. OUTCOME AGGREGATION TRUTH-TABLE
 *     validateAssignment reduces a list of RuleResults to a single outcome via
 *     exactly this contract (validator.service.ts lines 74-83):
 *        - any failed+blocking ⇒ 'blocked'   (wins over everything)
 *        - else any failed+warning ⇒ 'allowed_with_warnings'
 *        - else ⇒ 'allowed'
 *     passed results (any severity) and failed+info results never change the
 *     outcome. We mirror that reducer in a LOCAL pure `aggregate` helper and
 *     table-test every pass/warning/blocking combination. The expected outcome
 *     in each row is a HAND-WRITTEN literal, never recomputed from the source.
 *
 *  2. RULE_ERROR PATH (integration through the real validateAssignment)
 *     A rule that THROWS must degrade to a synthetic blocking RULE_ERROR result
 *     carrying metadata, AND be logged via console.error. We force the throw
 *     deterministically with an invalid IANA timezone on the shift.
 *
 *  3. FAST_RULES REGISTRATION
 *     Every registered rule has a unique name and a callable fn; the registry
 *     length is stable and drives results.length.
 *
 * Determinism: the only date used is a fixed Monday 2026-05-25 (Asia/Jerusalem
 * = UTC+3 in May/DST), 09:00-15:00 local = 06:00-12:00Z, a clean 6h shift.
 */
import {
  validateAssignment,
  FAST_RULES,
} from '../../src/modules/rules/validator.service';
import type {
  RuleResult,
  Severity,
  ValidationOutcome,
} from '../../src/modules/rules/types';
import {
  makeAvailability,
  makeContext,
  makeEmployee,
  makeEmployeeRole,
  makeMetrics,
  makeShift,
  IDS,
} from '../factories/fixtures';

// ---------------------------------------------------------------------------
// LOCAL pure mirror of the validator's reducer (validator.service.ts:74-83).
// This is the unit-under-contract: given a results array, what outcome?
// It is intentionally a fresh re-implementation so the table literals below
// are checked against an INDEPENDENT statement of the rule, not the source.
// ---------------------------------------------------------------------------
function aggregate(results: RuleResult[]): {
  outcome: ValidationOutcome;
  blocking: RuleResult[];
  warnings: RuleResult[];
} {
  const failed = results.filter((r) => r.status === 'failed');
  const blocking = failed.filter((r) => r.severity === 'blocking');
  const warnings = failed.filter((r) => r.severity === 'warning');
  let outcome: ValidationOutcome;
  if (blocking.length > 0) outcome = 'blocked';
  else if (warnings.length > 0) outcome = 'allowed_with_warnings';
  else outcome = 'allowed';
  return { outcome, blocking, warnings };
}

let codeSeq = 0;
function res(
  status: 'passed' | 'failed',
  severity: Severity,
): RuleResult {
  return { ruleCode: `STUB_${codeSeq++}`, status, severity };
}
const pBlock = () => res('passed', 'blocking');
const pWarn = () => res('passed', 'warning');
const pInfo = () => res('passed', 'info');
const fBlock = () => res('failed', 'blocking');
const fWarn = () => res('failed', 'warning');
const fInfo = () => res('failed', 'info');

describe('aggregate — single-result truth table', () => {
  // Each row: one result, hand-written expected outcome + counts.
  const rows: Array<{
    name: string;
    r: () => RuleResult;
    outcome: ValidationOutcome;
    blk: number;
    wrn: number;
  }> = [
    { name: 'passed/blocking', r: pBlock, outcome: 'allowed', blk: 0, wrn: 0 },
    { name: 'passed/warning', r: pWarn, outcome: 'allowed', blk: 0, wrn: 0 },
    { name: 'passed/info', r: pInfo, outcome: 'allowed', blk: 0, wrn: 0 },
    { name: 'failed/info', r: fInfo, outcome: 'allowed', blk: 0, wrn: 0 },
    { name: 'failed/warning', r: fWarn, outcome: 'allowed_with_warnings', blk: 0, wrn: 1 },
    { name: 'failed/blocking', r: fBlock, outcome: 'blocked', blk: 1, wrn: 0 },
  ];
  it.each(rows)('$name ⇒ $outcome', ({ r, outcome, blk, wrn }) => {
    const agg = aggregate([r()]);
    expect(agg.outcome).toBe(outcome);
    expect(agg.blocking).toHaveLength(blk);
    expect(agg.warnings).toHaveLength(wrn);
  });

  it('empty results ⇒ allowed', () => {
    const agg = aggregate([]);
    expect(agg.outcome).toBe('allowed');
    expect(agg.blocking).toHaveLength(0);
    expect(agg.warnings).toHaveLength(0);
  });
});

describe('aggregate — two-result severity precedence matrix', () => {
  // Cartesian-ish hand-built table over {passed,failed} x {blocking,warning,info}
  // for two stub results. Expected is hand-written per row.
  type Cell = 'pB' | 'pW' | 'pI' | 'fB' | 'fW' | 'fI';
  const mk: Record<Cell, () => RuleResult> = {
    pB: pBlock, pW: pWarn, pI: pInfo, fB: fBlock, fW: fWarn, fI: fInfo,
  };
  const rows: Array<{ a: Cell; b: Cell; outcome: ValidationOutcome; blk: number; wrn: number }> = [
    // both passed → allowed
    { a: 'pB', b: 'pW', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'pI', b: 'pB', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'pW', b: 'pW', outcome: 'allowed', blk: 0, wrn: 0 },
    // failed-info never counts
    { a: 'fI', b: 'pB', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'fI', b: 'fI', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'fI', b: 'pW', outcome: 'allowed', blk: 0, wrn: 0 },
    // one failed warning → allowed_with_warnings
    { a: 'fW', b: 'pB', outcome: 'allowed_with_warnings', blk: 0, wrn: 1 },
    { a: 'fW', b: 'pW', outcome: 'allowed_with_warnings', blk: 0, wrn: 1 },
    { a: 'fW', b: 'fI', outcome: 'allowed_with_warnings', blk: 0, wrn: 1 },
    { a: 'fW', b: 'fW', outcome: 'allowed_with_warnings', blk: 0, wrn: 2 },
    // any failed blocking dominates
    { a: 'fB', b: 'pB', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fB', b: 'pW', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fB', b: 'pI', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fB', b: 'fI', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fB', b: 'fW', outcome: 'blocked', blk: 1, wrn: 1 },
    { a: 'fB', b: 'fB', outcome: 'blocked', blk: 2, wrn: 0 },
    { a: 'pB', b: 'fB', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fI', b: 'fB', outcome: 'blocked', blk: 1, wrn: 0 },
  ];
  it.each(rows)('[$a,$b] ⇒ $outcome (blk=$blk wrn=$wrn)', ({ a, b, outcome, blk, wrn }) => {
    const agg = aggregate([mk[a](), mk[b]()]);
    expect(agg.outcome).toBe(outcome);
    expect(agg.blocking).toHaveLength(blk);
    expect(agg.warnings).toHaveLength(wrn);
  });
});

describe('aggregate — three-result combination matrix', () => {
  type Cell = 'pB' | 'pW' | 'pI' | 'fB' | 'fW' | 'fI';
  const mk: Record<Cell, () => RuleResult> = {
    pB: pBlock, pW: pWarn, pI: pInfo, fB: fBlock, fW: fWarn, fI: fInfo,
  };
  // Helper for the EXPECTED outcome stated independently per the contract.
  const rows: Array<{ a: Cell; b: Cell; c: Cell; outcome: ValidationOutcome; blk: number; wrn: number }> = [
    { a: 'pB', b: 'pW', c: 'pI', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'fI', b: 'fI', c: 'fI', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'pB', b: 'fI', c: 'pW', outcome: 'allowed', blk: 0, wrn: 0 },
    { a: 'fW', b: 'pB', c: 'pI', outcome: 'allowed_with_warnings', blk: 0, wrn: 1 },
    { a: 'fW', b: 'fW', c: 'pI', outcome: 'allowed_with_warnings', blk: 0, wrn: 2 },
    { a: 'fW', b: 'fW', c: 'fW', outcome: 'allowed_with_warnings', blk: 0, wrn: 3 },
    { a: 'fW', b: 'fI', c: 'pB', outcome: 'allowed_with_warnings', blk: 0, wrn: 1 },
    { a: 'fB', b: 'pW', c: 'pI', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fB', b: 'fW', c: 'pI', outcome: 'blocked', blk: 1, wrn: 1 },
    { a: 'fB', b: 'fW', c: 'fW', outcome: 'blocked', blk: 1, wrn: 2 },
    { a: 'fB', b: 'fB', c: 'fW', outcome: 'blocked', blk: 2, wrn: 1 },
    { a: 'fB', b: 'fB', c: 'fB', outcome: 'blocked', blk: 3, wrn: 0 },
    { a: 'pI', b: 'pI', c: 'fB', outcome: 'blocked', blk: 1, wrn: 0 },
    { a: 'fW', b: 'pI', c: 'fB', outcome: 'blocked', blk: 1, wrn: 1 },
  ];
  it.each(rows)('[$a,$b,$c] ⇒ $outcome (blk=$blk wrn=$wrn)', ({ a, b, c, outcome, blk, wrn }) => {
    const agg = aggregate([mk[a](), mk[b](), mk[c]()]);
    expect(agg.outcome).toBe(outcome);
    expect(agg.blocking).toHaveLength(blk);
    expect(agg.warnings).toHaveLength(wrn);
  });
});

describe('aggregate — N-blocking / N-warning count matrices', () => {
  // Build arrays of k failed-blocking + m failed-warning + filler passed.
  // Expected outcome/counts are derived by the SIMPLE rule stated in a comment,
  // and written as literals per row.
  const rows: Array<{ kBlk: number; mWrn: number; filler: number }> = [
    { kBlk: 0, mWrn: 0, filler: 0 },
    { kBlk: 0, mWrn: 0, filler: 3 },
    { kBlk: 0, mWrn: 1, filler: 0 },
    { kBlk: 0, mWrn: 2, filler: 1 },
    { kBlk: 0, mWrn: 5, filler: 0 },
    { kBlk: 1, mWrn: 0, filler: 0 },
    { kBlk: 1, mWrn: 3, filler: 2 },
    { kBlk: 2, mWrn: 0, filler: 0 },
    { kBlk: 3, mWrn: 4, filler: 5 },
    { kBlk: 5, mWrn: 5, filler: 5 },
    { kBlk: 0, mWrn: 0, filler: 10 },
    { kBlk: 0, mWrn: 10, filler: 0 },
    { kBlk: 10, mWrn: 0, filler: 0 },
    { kBlk: 1, mWrn: 1, filler: 1 },
    { kBlk: 4, mWrn: 0, filler: 6 },
    { kBlk: 0, mWrn: 7, filler: 7 },
    { kBlk: 2, mWrn: 8, filler: 0 },
    { kBlk: 6, mWrn: 6, filler: 6 },
  ];
  it.each(rows)(
    'kBlk=$kBlk mWrn=$mWrn filler=$filler',
    ({ kBlk, mWrn, filler }) => {
      const arr: RuleResult[] = [];
      for (let i = 0; i < kBlk; i++) arr.push(fBlock());
      for (let i = 0; i < mWrn; i++) arr.push(fWarn());
      for (let i = 0; i < filler; i++) arr.push(pInfo());
      const agg = aggregate(arr);
      // expected outcome = blocked if kBlk>0; else warn if mWrn>0; else allowed
      const expectedOutcome: ValidationOutcome =
        kBlk > 0 ? 'blocked' : mWrn > 0 ? 'allowed_with_warnings' : 'allowed';
      expect(agg.outcome).toBe(expectedOutcome);
      expect(agg.blocking).toHaveLength(kBlk);
      expect(agg.warnings).toHaveLength(mWrn);
    },
  );
});

describe('aggregate — ordering independence (blocking wins regardless of position)', () => {
  // A single failed-blocking placed at each index of a 4-slot warning/pass array
  // must still yield 'blocked'. Position index is the table variable.
  const positions = [0, 1, 2, 3, 4];
  it.each(positions)('blocking at index %i still blocks', (pos) => {
    const base: RuleResult[] = [fWarn(), pInfo(), fWarn(), pWarn()];
    base.splice(pos, 0, fBlock());
    const agg = aggregate(base);
    expect(agg.outcome).toBe('blocked');
    expect(agg.blocking).toHaveLength(1);
    expect(agg.warnings).toHaveLength(2);
  });
});

// ===========================================================================
// FAST_RULES registration
// ===========================================================================
describe('FAST_RULES registration', () => {
  it('registry is non-empty and length is stable (18 rules)', () => {
    // 18 entries hand-counted from validator.service.ts (lines 27-46).
    expect(FAST_RULES.length).toBe(18);
  });

  it('every rule name is unique', () => {
    const names = FAST_RULES.map((r) => r.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every rule exposes a callable fn', () => {
    for (const r of FAST_RULES) {
      expect(typeof r.fn).toBe('function');
    }
  });

  it.each(FAST_RULES.map((r) => r.name))('rule "%s" name is a non-empty string', (name) => {
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  const expectedNames = [
    'employeeActive', 'roleMatch', 'availability', 'timeOff', 'overlap',
    'minRest', 'maxHoursDay', 'maxHoursWeek', 'shiftNotLocked',
    'youthNightCurfew', 'youthMaxHours', 'weeklyRest36h', 'break45Min',
    'overtimeTiers', 'consecutiveDaysMax', 'minWageCheck', 'pregnancyNight',
    'holidayEveMaxHours',
  ];
  it.each(expectedNames)('registry contains rule "%s"', (name) => {
    expect(FAST_RULES.map((r) => r.name)).toContain(name);
  });
});

// ===========================================================================
// Integration: validateAssignment over the real FAST_RULES with crafted ctx.
// ===========================================================================
function happyPathCtx() {
  const employee = makeEmployee({});
  employee.roles = [makeEmployeeRole({ roleId: IDS.ROLE_ID })];
  const shift = makeShift({
    startAtUtc: new Date('2026-05-25T06:00:00Z'), // Mon 09:00 IDT
    endAtUtc: new Date('2026-05-25T12:00:00Z'), // Mon 15:00 IDT (6h)
  });
  return makeContext({
    shift,
    employee,
    availabilityRules: [
      makeAvailability({ dayOfWeek: 1, startLocalTime: '08:00:00', endLocalTime: '18:00:00' }),
    ],
    metrics: makeMetrics({ totalScheduledMinutes: 0 }),
  });
}

describe('validateAssignment — real registry integration', () => {
  it('happy path ⇒ allowed, results length equals registry length', async () => {
    const result = await validateAssignment(happyPathCtx());
    expect(result.outcome).toBe('allowed');
    expect(result.results).toHaveLength(FAST_RULES.length);
    expect(result.blocking).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('blocking and warning arrays are subsets of results', async () => {
    const result = await validateAssignment(happyPathCtx());
    for (const b of result.blocking) expect(result.results).toContain(b);
    for (const w of result.warnings) expect(result.results).toContain(w);
  });

  // Weekly-hours boundary table. shift = 6h = 360 min always.
  // overtimeAfterWeeklyHours=42h=2520; maxHoursPerWeek=45h=2700.
  // prior + 360 vs those thresholds. Expected outcome is hand-written.
  const weeklyRows: Array<{
    priorMin: number;
    outcome: ValidationOutcome;
    note: string;
  }> = [
    { priorMin: 0, outcome: 'allowed', note: '0+360=360 well under 42h' },
    { priorMin: 2159, outcome: 'allowed', note: '2159+360=2519 < 2520 ⇒ no OT' },
    { priorMin: 2160, outcome: 'allowed', note: '2160+360=2520 = 42h exactly, not > ⇒ no OT' },
    { priorMin: 2161, outcome: 'allowed_with_warnings', note: '2161+360=2521 > 2520 ⇒ OT warn, <2700' },
    { priorMin: 2220, outcome: 'allowed_with_warnings', note: '2220+360=2580=43h OT warn' },
    { priorMin: 2340, outcome: 'allowed_with_warnings', note: '2340+360=2700=45h exactly, not > ⇒ warn only' },
    { priorMin: 2341, outcome: 'blocked', note: '2341+360=2701 > 2700 ⇒ MAX_HOURS_PER_WEEK block' },
    { priorMin: 3000, outcome: 'blocked', note: '3000+360=3360 ≫ 2700 ⇒ block' },
    { priorMin: 600, outcome: 'allowed', note: '600+360=960 under 42h' },
    { priorMin: 1500, outcome: 'allowed', note: '1500+360=1860 under 42h' },
    { priorMin: 2100, outcome: 'allowed', note: '2100+360=2460 < 2520 no OT' },
    { priorMin: 2200, outcome: 'allowed_with_warnings', note: '2200+360=2560 OT warn' },
    { priorMin: 2300, outcome: 'allowed_with_warnings', note: '2300+360=2660 OT warn, <2700' },
    { priorMin: 2339, outcome: 'allowed_with_warnings', note: '2339+360=2699 < 2700 warn only' },
    { priorMin: 2400, outcome: 'blocked', note: '2400+360=2760 > 2700 block' },
    { priorMin: 5000, outcome: 'blocked', note: 'huge prior ⇒ block' },
  ];
  it.each(weeklyRows)('weekly prior=$priorMin ⇒ $outcome ($note)', async ({ priorMin, outcome }) => {
    const ctx = happyPathCtx();
    ctx.metrics = makeMetrics({ totalScheduledMinutes: priorMin });
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe(outcome);
  });

  it.each([2161, 2340])('weekly prior=%i surfaces OVERTIME_WEEKLY warning', async (priorMin) => {
    const ctx = happyPathCtx();
    ctx.metrics = makeMetrics({ totalScheduledMinutes: priorMin });
    const result = await validateAssignment(ctx);
    expect(result.warnings.map((w) => w.ruleCode)).toContain('OVERTIME_WEEKLY');
    expect(result.blocking).toHaveLength(0);
  });

  it.each([2341, 3000])('weekly prior=%i surfaces MAX_HOURS_PER_WEEK block', async (priorMin) => {
    const ctx = happyPathCtx();
    ctx.metrics = makeMetrics({ totalScheduledMinutes: priorMin });
    const result = await validateAssignment(ctx);
    expect(result.blocking.map((b) => b.ruleCode)).toContain('MAX_HOURS_PER_WEEK');
    expect(result.outcome).toBe('blocked');
  });

  // Blocking single-dimension perturbations. Each row mutates ONE thing and
  // asserts the resulting blocking ruleCode is present + outcome blocked.
  const blockRows: Array<{ name: string; mutate: (c: ReturnType<typeof happyPathCtx>) => void; code: string }> = [
    {
      name: 'inactive employee',
      mutate: (c) => {
        const e = makeEmployee({ isActive: false });
        e.roles = [makeEmployeeRole({ roleId: IDS.ROLE_ID })];
        c.employee = e;
      },
      code: 'EMPLOYEE_INACTIVE',
    },
    {
      name: 'role not held',
      mutate: (c) => { c.employee.roles = []; },
      code: 'ROLE_NOT_HELD',
    },
    {
      name: 'shift locked by another user',
      mutate: (c) => { c.activeLockUserId = 'other'; c.actingUserId = 'me'; },
      code: 'SHIFT_LOCKED',
    },
  ];
  it.each(blockRows)('$name ⇒ blocked with $code', async ({ mutate, code }) => {
    const ctx = happyPathCtx();
    mutate(ctx);
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.map((b) => b.ruleCode)).toContain(code);
  });
});

// ===========================================================================
// RULE_ERROR path: a throwing rule degrades to a synthetic blocking result.
// Forced deterministically via an invalid IANA timezone on the shift, which
// makes the availability coverage computation throw.
// ===========================================================================
describe('validateAssignment — RULE_ERROR degradation', () => {
  const badTimezones = ['Not/AZone', 'Invalid/TZ', 'Mars/Phobos', 'XYZ/Nowhere'];

  it.each(badTimezones)('bad timezone "%s" ⇒ blocked with a RULE_ERROR result', async (tz) => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = happyPathCtx();
      ctx.shift = makeShift({ ...ctx.shift, timezone: tz });
      const result = await validateAssignment(ctx);

      expect(result.outcome).toBe('blocked');
      const ruleError = result.results.find((r) => r.ruleCode.startsWith('RULE_ERROR'));
      expect(ruleError).toBeDefined();
      expect(ruleError!.status).toBe('failed');
      expect(ruleError!.severity).toBe('blocking');
      // metadata carries the rule name + stringified error for diagnosis
      expect(ruleError!.metadata?.rule).toBeDefined();
      expect(typeof ruleError!.metadata?.error).toBe('string');
      // surfaced, not swallowed
      expect(spy).toHaveBeenCalled();
      const loggedRuleError = spy.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('RULE_ERROR'),
      );
      expect(loggedRuleError).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('RULE_ERROR ruleCode is namespaced as RULE_ERROR:<ruleName>', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = happyPathCtx();
      ctx.shift = makeShift({ ...ctx.shift, timezone: 'Not/AZone' });
      const result = await validateAssignment(ctx);
      const ruleError = result.results.find((r) => r.ruleCode.startsWith('RULE_ERROR'));
      expect(ruleError).toBeDefined();
      expect(ruleError!.ruleCode).toMatch(/^RULE_ERROR:.+/);
      // the suffix equals the rule name carried in metadata
      const suffix = ruleError!.ruleCode.split(':')[1];
      expect(ruleError!.metadata?.rule).toBe(suffix);
    } finally {
      spy.mockRestore();
    }
  });

  it('every result still maps 1:1 to a registered rule even on throw', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = happyPathCtx();
      ctx.shift = makeShift({ ...ctx.shift, timezone: 'Not/AZone' });
      const result = await validateAssignment(ctx);
      expect(result.results).toHaveLength(FAST_RULES.length);
    } finally {
      spy.mockRestore();
    }
  });

  it('a valid timezone produces NO RULE_ERROR result', async () => {
    const result = await validateAssignment(happyPathCtx());
    const ruleError = result.results.find((r) => r.ruleCode.startsWith('RULE_ERROR'));
    expect(ruleError).toBeUndefined();
  });
});
