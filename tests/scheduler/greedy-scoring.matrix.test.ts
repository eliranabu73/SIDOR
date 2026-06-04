/**
 * Broad table-driven matrix for the REAL scoring.service + GreedySchedulerProvider.
 *
 * Two halves:
 *   1. scoreCandidate(signals, weights) — pure scoring. Every expected value is a
 *      HAND-COMPUTED literal in agorot-style fixed decimals; the arithmetic that
 *      produced it lives in the table comment so the assertion is not a tautology
 *      (we never call the source formula to derive the expected).
 *   2. GreedySchedulerProvider.run(...) driven via a mocked generateCandidates so
 *      we exercise distribution / requiredEmployeeCount / same-day avoidance /
 *      all-ineligible -> unfilledShiftIds / violations+warnings -> _candidateRows
 *      WITHOUT a DB.
 *
 * Determinism: every shift is pinned to a FIXED calendar date in the summer week
 * starting 2026-06-07 (Asia/Jerusalem = UTC+3, no DST changes mid-week). Local day
 * keys are therefore stable. No clock / random in any expectation.
 *
 * Scoring constants (src/modules/scheduler/types.ts DEFAULT_WEIGHTS):
 *   availability 1.0, preference 0.5, fairness 0.8,
 *   weeklyHoursBalance 0.4, weekendBalance 0.3, nightBalance 0.3
 *   sumWeights = 1.0+0.5+0.8+0.4+0.3+0.3 = 3.3
 *
 * Per-signal goodness maps (src/modules/scheduler/scoring.service.ts):
 *   availability      = clamp01(availabilityCoverage)
 *   preference        = clamp01((preferenceScore + 10) / 20)
 *   fairness          = clamp01((3 - fairnessScore) / 6)
 *   weeklyHoursBalance= clamp01(1 - min(1, |weeklyHoursDelta| / max(60, 2400)))   // preferred=40*60=2400
 *   weekendBalance    = isWeekendShift ? clamp01(1 - weekendShiftCount/3) : 1
 *   nightBalance      = isNightShift   ? clamp01(1 - nightShiftCount/3)   : 1
 *
 * NEUTRAL baseline (all defaults): goodness =
 *   availability 1, preference (0+10)/20=0.5, fairness (3-0)/6=0.5,
 *   weeklyHoursBalance 1, weekendBalance 1, nightBalance 1
 *   weighted = 1*1.0 + 0.5*0.5 + 0.5*0.8 + 1*0.4 + 1*0.3 + 1*0.3
 *            = 1.0 + 0.25 + 0.4 + 0.4 + 0.3 + 0.3 = 2.65
 *   score = 2.65 / 3.3 = 0.80303030303...
 */
import { jest } from '@jest/globals';
import { scoreCandidate } from '../../src/modules/scheduler/scoring.service';
import type {
  Candidate,
  CandidateSignals,
  ScoringWeights,
} from '../../src/modules/scheduler/types';

// ---------------------------------------------------------------------------
// PART 1 — pure scoring (no mock needed)
// ---------------------------------------------------------------------------

function sig(over: Partial<CandidateSignals> = {}): CandidateSignals {
  return {
    availabilityCoverage: 1,
    preferenceScore: 0,
    fairnessScore: 0,
    weeklyHoursDelta: 0,
    weekendShiftCount: 0,
    nightShiftCount: 0,
    isNightShift: false,
    isWeekendShift: false,
    ...over,
  };
}

const NEUTRAL = 0.8030303030303; // 2.65 / 3.3

describe('scoreCandidate — availability sweep (single signal varied)', () => {
  // weighted = avail*1.0 + 0.25 + 0.4 + 0.4 + 0.3 + 0.3 = avail + 1.65
  // score = (avail + 1.65) / 3.3
  type Row = [name: string, coverage: number, expected: number];
  const rows: Row[] = [
    ['0.0 coverage', 0.0, 0.5], // (0    + 1.65)/3.3 = 1.65/3.3 = 0.5
    ['0.25 coverage', 0.25, 0.5757575757576], // 1.90/3.3
    ['0.50 coverage', 0.5, 0.6515151515152], // 2.15/3.3
    ['0.75 coverage', 0.75, 0.7272727272727], // 2.40/3.3
    ['1.0 coverage', 1.0, NEUTRAL], // 2.65/3.3
    ['over-1 clamps to 1', 5, NEUTRAL], // clamp01(5)=1 -> 2.65/3.3
    ['negative clamps to 0', -3, 0.5], // clamp01(-3)=0 -> 1.65/3.3
  ];
  it.each(rows)('%s', (_n, coverage, expected) => {
    const { score } = scoreCandidate(sig({ availabilityCoverage: coverage }));
    expect(score).toBeCloseTo(expected, 9);
  });

  it('availability is monotonic non-decreasing across the sweep', () => {
    const cov = [0, 0.25, 0.5, 0.75, 1];
    const scores = cov.map((c) => scoreCandidate(sig({ availabilityCoverage: c })).score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
    }
  });
});

describe('scoreCandidate — preference sweep (single signal varied)', () => {
  // preference goodness = clamp01((p+10)/20); contribution weight 0.5
  // weighted = 1.0 + pref*0.5 + 0.4 + 0.4 + 0.3 + 0.3 = pref*0.5 + 2.4
  // score = (pref*0.5 + 2.4)/3.3
  type Row = [name: string, pref: number, goodness: number, expected: number];
  const rows: Row[] = [
    ['-10 -> 0.0', -10, 0.0, 0.7272727272727], // (0      +2.4)/3.3 = 2.4/3.3
    ['-5  -> 0.25', -5, 0.25, 0.7651515151515], // (0.125 +2.4)/3.3 = 2.525/3.3
    ['0   -> 0.5', 0, 0.5, NEUTRAL], // (0.25  +2.4)/3.3 = 2.65/3.3
    ['5   -> 0.75', 5, 0.75, 0.8409090909091], // (0.375 +2.4)/3.3 = 2.775/3.3
    ['10  -> 1.0', 10, 1.0, 0.8787878787879], // (0.5   +2.4)/3.3 = 2.9/3.3
    ['below -10 clamps', -50, 0.0, 0.7272727272727], // clamp01 -> 0
    ['above 10 clamps', 50, 1.0, 0.8787878787879], // clamp01 -> 1
  ];
  it.each(rows)('%s', (_n, pref, _g, expected) => {
    const { score } = scoreCandidate(sig({ preferenceScore: pref }));
    expect(score).toBeCloseTo(expected, 9);
  });

  it('preference contribution in breakdown equals goodness*0.5', () => {
    // p=5 -> goodness 0.75 -> contribution 0.375
    const { breakdown } = scoreCandidate(sig({ preferenceScore: 5 }));
    expect(breakdown.preference).toBeCloseTo(0.375, 12);
  });
});

describe('scoreCandidate — fairness sweep (under-scheduled wins)', () => {
  // fairness goodness = clamp01((3 - z)/6); weight 0.8
  // weighted = 1.0 + 0.25 + fair*0.8 + 0.4 + 0.3 + 0.3 = fair*0.8 + 2.25
  // score = (fair*0.8 + 2.25)/3.3
  type Row = [name: string, z: number, goodness: number, expected: number];
  const rows: Row[] = [
    ['z=-3 (very under) -> 1.0', -3, 1.0, 0.9242424242424], // (0.8  +2.25)/3.3 = 3.05/3.3
    ['z=-1.5 -> 0.75', -1.5, 0.75, 0.8636363636364], // (0.6  +2.25)/3.3 = 2.85/3.3
    ['z=0 -> 0.5', 0, 0.5, NEUTRAL], // (0.4  +2.25)/3.3 = 2.65/3.3
    ['z=1.5 -> 0.25', 1.5, 0.25, 0.7424242424242], // (0.2  +2.25)/3.3 = 2.45/3.3
    ['z=3 (very over) -> 0.0', 3, 0.0, 0.6818181818182], // (0    +2.25)/3.3 = 2.25/3.3
    ['z=6 clamps to 0', 6, 0.0, 0.6818181818182], // (3-6)/6=-0.5 -> 0
    ['z=-6 clamps to 1', -6, 1.0, 0.9242424242424], // (3+6)/6=1.5 -> 1
  ];
  it.each(rows)('%s', (_n, z, _g, expected) => {
    const { score } = scoreCandidate(sig({ fairnessScore: z }));
    expect(score).toBeCloseTo(expected, 9);
  });

  it('under-scheduled strictly beats over-scheduled', () => {
    const under = scoreCandidate(sig({ fairnessScore: -3 })).score;
    const over = scoreCandidate(sig({ fairnessScore: 3 })).score;
    expect(under).toBeGreaterThan(over);
    // exact gap = 0.8/3.3 = 0.2424242...
    expect(under - over).toBeCloseTo(0.2424242424242, 9);
  });
});

describe('scoreCandidate — weeklyHoursBalance sweep (preferred=2400min)', () => {
  // goodness = clamp01(1 - min(1, |delta| / 2400)); weight 0.4
  // weighted = 1.0 + 0.25 + 0.4 + bal*0.4 + 0.3 + 0.3 = bal*0.4 + 2.25
  // score = (bal*0.4 + 2.25)/3.3
  type Row = [name: string, delta: number, goodness: number, expected: number];
  const rows: Row[] = [
    ['delta 0 -> 1.0', 0, 1.0, NEUTRAL], // (0.4 +2.25)/3.3 = 2.65/3.3
    ['delta 600 -> 0.75', 600, 0.75, 0.7727272727273], // 1-600/2400=0.75 -> (0.3+2.25)/3.3=2.55/3.3
    ['delta 1200 -> 0.5', 1200, 0.5, 0.7424242424242], // 1-0.5 -> (0.2+2.25)/3.3=2.45/3.3
    ['delta 2400 -> 0.0', 2400, 0.0, 0.6818181818182], // 1-1 -> (0+2.25)/3.3=2.25/3.3
    ['delta 9999 clamps to 0', 9999, 0.0, 0.6818181818182], // min(1,..)=1 -> 0
    ['negative delta uses abs', -1200, 0.5, 0.7424242424242], // |−1200|=1200 -> 0.5
  ];
  it.each(rows)('%s', (_n, delta, _g, expected) => {
    const { score } = scoreCandidate(sig({ weeklyHoursDelta: delta }));
    expect(score).toBeCloseTo(expected, 9);
  });
});

describe('scoreCandidate — weekendBalance (only counts on weekend shifts)', () => {
  // On weekend: goodness = clamp01(1 - count/3); weight 0.3
  //   weighted = 1.0+0.25+0.4+0.4 + wk*0.3 + 0.3 = wk*0.3 + 2.35
  //   score = (wk*0.3 + 2.35)/3.3
  // Off weekend: weekendBalance = 1 regardless of count -> NEUTRAL.
  type Row = [name: string, weekend: boolean, count: number, expected: number];
  const rows: Row[] = [
    ['weekend, count 0 -> 1.0', true, 0, NEUTRAL], // (0.3 +2.35)/3.3 = 2.65/3.3
    ['weekend, count 1 -> 2/3', true, 1, 0.7626262626263], // 1-1/3=0.6667 -> (0.2+2.35)/3.3=2.55/3.3 ... see note
    ['weekend, count 3 -> 0.0', true, 3, 0.7121212121212], // 1-1=0 -> (0+2.35)/3.3=2.35/3.3
    ['weekend, count 5 clamps to 0', true, 5, 0.7121212121212], // 1-5/3<0 -> clamp 0
    ['weekday ignores count 5', false, 5, NEUTRAL], // weekendBalance=1
  ];
  // note for count 1: goodness = 1 - 1/3 = 0.666666..., contribution 0.3*0.6666667=0.2
  // weighted = 0.2 + 2.35 = 2.55 ; score = 2.55/3.3 = 0.77272727... NOT 0.76262
  // -> correct that literal:
  it.each(rows.map((r) => (r[2] === 1 ? (['weekend, count 1 -> 2/3', true, 1, 0.7727272727273] as Row) : r)))(
    '%s',
    (_n, weekend, count, expected) => {
      const { score } = scoreCandidate(
        sig({ isWeekendShift: weekend, weekendShiftCount: count }),
      );
      expect(score).toBeCloseTo(expected, 9);
    },
  );

  it('weekend pile-up lowers score but a weekday with same count does not', () => {
    const heavyWeekend = scoreCandidate(sig({ isWeekendShift: true, weekendShiftCount: 3 })).score;
    const weekday = scoreCandidate(sig({ isWeekendShift: false, weekendShiftCount: 3 })).score;
    expect(weekday).toBeGreaterThan(heavyWeekend);
    expect(weekday).toBeCloseTo(NEUTRAL, 9);
    expect(heavyWeekend).toBeCloseTo(0.7121212121212, 9); // 2.35/3.3
  });
});

describe('scoreCandidate — nightBalance (only counts on night shifts)', () => {
  // symmetric to weekend: weight 0.3
  type Row = [name: string, night: boolean, count: number, expected: number];
  const rows: Row[] = [
    ['night, count 0 -> 1.0', true, 0, NEUTRAL], // 2.65/3.3
    ['night, count 3 -> 0.0', true, 3, 0.7121212121212], // 2.35/3.3
    ['night, count 9 clamps', true, 9, 0.7121212121212], // clamp 0 -> 2.35/3.3
    ['day shift ignores count 9', false, 9, NEUTRAL], // nightBalance=1
  ];
  it.each(rows)('%s', (_n, night, count, expected) => {
    const { score } = scoreCandidate(sig({ isNightShift: night, nightShiftCount: count }));
    expect(score).toBeCloseTo(expected, 9);
  });
});

describe('scoreCandidate — NaN / edge inputs clamp to [0,1]', () => {
  type Row = [name: string, over: Partial<CandidateSignals>];
  const rows: Row[] = [
    ['NaN availability', { availabilityCoverage: Number.NaN }],
    ['NaN preference', { preferenceScore: Number.NaN }],
    ['Infinity delta', { weeklyHoursDelta: Number.POSITIVE_INFINITY }],
    ['huge negative everything', {
      availabilityCoverage: -1e9,
      preferenceScore: -1e9,
      fairnessScore: 1e9,
      weeklyHoursDelta: 1e9,
    }],
    ['huge positive everything', {
      availabilityCoverage: 1e9,
      preferenceScore: 1e9,
      fairnessScore: -1e9,
      weeklyHoursDelta: 0,
    }],
  ];
  it.each(rows)('%s stays in range', (_n, over) => {
    const { score } = scoreCandidate(sig(over));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('NaN availability behaves like 0 availability (2.65 - 1.0 contribution)', () => {
    // availability clamp01(NaN)=0 -> weighted = 0 + 0.25+0.4+0.4+0.3+0.3 = 1.65
    const { score } = scoreCandidate(sig({ availabilityCoverage: Number.NaN }));
    expect(score).toBeCloseTo(0.5, 9); // 1.65/3.3
  });
});

describe('scoreCandidate — custom weight matrices', () => {
  // Vary ONE weight at a time; recompute sumWeights and expected by hand.
  it('zeroing preference weight removes its term and renormalizes', () => {
    // weights: avail1.0 pref0 fair0.8 whb0.4 wkb0.3 night0.3 -> sum=2.8
    // neutral goodness: avail1, fair0.5, whb1, wkb1, night1 (pref term *0)
    // weighted = 1.0 + 0 + 0.4 + 0.4 + 0.3 + 0.3 = 2.4 ; score = 2.4/2.8
    const w: ScoringWeights = {
      availability: 1.0, preference: 0, fairness: 0.8,
      weeklyHoursBalance: 0.4, weekendBalance: 0.3, nightBalance: 0.3,
    };
    const { score } = scoreCandidate(sig(), w);
    expect(score).toBeCloseTo(0.8571428571429, 9); // 2.4/2.8
  });

  it('all weights zero -> score 0 (guard against /0)', () => {
    const w: ScoringWeights = {
      availability: 0, preference: 0, fairness: 0,
      weeklyHoursBalance: 0, weekendBalance: 0, nightBalance: 0,
    };
    const { score } = scoreCandidate(sig(), w);
    expect(score).toBe(0);
  });

  it('availability-only weighting yields raw availability goodness', () => {
    // sum=1.0, only availability term -> score == availabilityCoverage
    const w: ScoringWeights = {
      availability: 1.0, preference: 0, fairness: 0,
      weeklyHoursBalance: 0, weekendBalance: 0, nightBalance: 0,
    };
    expect(scoreCandidate(sig({ availabilityCoverage: 0.42 }), w).score).toBeCloseTo(0.42, 12);
    expect(scoreCandidate(sig({ availabilityCoverage: 1 }), w).score).toBeCloseTo(1, 12);
  });

  it('doubling fairness weight increases an under-scheduled employee score', () => {
    const base = scoreCandidate(sig({ fairnessScore: -3 })).score; // 3.05/3.3
    const heavy: ScoringWeights = {
      availability: 1.0, preference: 0.5, fairness: 1.6,
      weeklyHoursBalance: 0.4, weekendBalance: 0.3, nightBalance: 0.3,
    };
    // sum = 4.1 ; weighted = 1.0+0.25+1.0*1.6 ... fair goodness 1.0 -> 1.6 contribution
    //  = 1.0 + 0.25 + 1.6 + 0.4 + 0.3 + 0.3 = 3.85 ; score = 3.85/4.1
    const { score } = scoreCandidate(sig({ fairnessScore: -3 }), heavy);
    expect(score).toBeCloseTo(0.9390243902439, 9);
    expect(score).toBeGreaterThan(base);
  });
});

// ---------------------------------------------------------------------------
// PART 2 — GreedySchedulerProvider distribution / propagation (mocked candidates)
// ---------------------------------------------------------------------------

const generateCandidatesMock =
  jest.fn<(scheduleId: string, prisma?: unknown) => Promise<Candidate[]>>();

jest.mock('../../src/modules/scheduler/candidate-generation.service', () => ({
  generateCandidates: generateCandidatesMock,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { GreedySchedulerProvider } from '../../src/modules/scheduler/providers/greedy.provider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Decimal = require('@prisma/client/runtime/library').Decimal;

const fakePrisma = {} as never;
const TZ = 'Asia/Jerusalem';

// Summer week starting 2026-06-07 (Asia/Jerusalem = UTC+3 all week — IST has no
// DST shifts in June). 06:00Z == 09:00 local; each shift is its own local day.
function makeShift(
  id: string,
  startIso: string,
  endIso: string,
  opts: { requiredEmployeeCount?: number } = {},
) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return {
    id,
    organizationId: 'org',
    locationId: null,
    departmentId: null,
    roleId: null,
    templateId: null,
    scheduleId: 's',
    startAtUtc: start,
    endAtUtc: end,
    timezone: TZ,
    localStartDate: start,
    localEndDate: end,
    requiredEmployeeCount: opts.requiredEmployeeCount ?? 1,
    status: 'PLANNED' as const,
    isOpenShift: false,
    version: 1,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function emp(id: string) {
  return {
    id,
    organizationId: 'org',
    fullName: id,
    email: null,
    phone: null,
    employmentType: 'FULL_TIME' as const,
    defaultLocationId: null,
    defaultTimezone: TZ,
    hourlyRate: new Decimal(0),
    weeklyBudgetHours: null,
    dateOfBirth: null,
    weeklyRestDay: 'SATURDAY' as const,
    israeliId: null,
    isPregnant: false,
    pregnancyWeeks: null,
    isActive: true,
    userId: null,
    hireDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function candidate(
  shift: ReturnType<typeof makeShift>,
  empId: string,
  eligible: boolean,
  opts: {
    signals?: Partial<CandidateSignals>;
    warnings?: Candidate['warnings'];
    violations?: Candidate['violations'];
  } = {},
): Candidate {
  return {
    shiftId: shift.id,
    shift,
    employee: emp(empId),
    signals: {
      availabilityCoverage: 1,
      preferenceScore: 0,
      fairnessScore: 0,
      weeklyHoursDelta: 0,
      weekendShiftCount: 0,
      nightShiftCount: 0,
      isNightShift: false,
      isWeekendShift: false,
      ...(opts.signals ?? {}),
    },
    eligible,
    warnings: opts.warnings ?? [],
    violations: opts.violations ?? [],
  };
}

function fullMatrix(
  shifts: ReturnType<typeof makeShift>[],
  empIds: string[],
  signalsByEmp: Record<string, Partial<CandidateSignals>> = {},
): Candidate[] {
  const out: Candidate[] = [];
  for (const s of shifts) {
    for (const e of empIds) {
      out.push(candidate(s, e, true, { signals: signalsByEmp[e] ?? {} }));
    }
  }
  return out;
}

async function run(candidates: Candidate[]) {
  generateCandidatesMock.mockResolvedValue(candidates);
  const provider = new GreedySchedulerProvider(fakePrisma);
  return provider.run({ scheduleId: 's' });
}

function loadByEmp(proposals: { employeeId: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of proposals) m.set(p.employeeId, (m.get(p.employeeId) ?? 0) + 1);
  return m;
}

// Each shift on its own local day, 06:00Z-14:00Z (09:00-17:00 local). 2026-06-d.
const DAY = (d: number, hStart = 6, hEnd = 14) => {
  const dd = String(d).padStart(2, '0');
  const hs = String(hStart).padStart(2, '0');
  const he = String(hEnd).padStart(2, '0');
  return [`2026-06-${dd}T${hs}:00:00Z`, `2026-06-${dd}T${he}:00:00Z`] as const;
};

beforeEach(() => {
  generateCandidatesMock.mockReset();
});

// ---- distribution grids: E employees x S shifts -> even spread -----------
describe('Greedy distribution grid — even spread (E employees x S shifts)', () => {
  // SPREAD_PENALTY 0.2/held shift makes ties round-robin. With S divisible by E
  // and all-equal scores, each employee gets exactly S/E shifts.
  type Row = [name: string, empCount: number, shiftCount: number, perEmp: number];
  const rows: Row[] = [
    ['2 emps, 2 shifts', 2, 2, 1],
    ['2 emps, 4 shifts', 2, 4, 2],
    ['2 emps, 6 shifts', 2, 6, 3],
    ['3 emps, 3 shifts', 3, 3, 1],
    ['3 emps, 6 shifts', 3, 6, 2],
    ['3 emps, 9 shifts', 3, 9, 3],
    ['4 emps, 4 shifts', 4, 4, 1],
    ['4 emps, 8 shifts', 4, 8, 2],
    ['5 emps, 5 shifts', 5, 5, 1],
    ['5 emps, 10 shifts', 5, 10, 2],
    ['6 emps, 6 shifts', 6, 6, 1],
    ['2 emps, 8 shifts', 2, 8, 4],
  ];
  it.each(rows)('%s -> each gets perEmp', async (_n, empCount, shiftCount, perEmp) => {
    const emps = Array.from({ length: empCount }, (_, i) => `e${i + 1}`);
    const shifts = Array.from({ length: shiftCount }, (_, i) => makeShift(`s${i}`, ...DAY(1 + i)));
    const out = await run(fullMatrix(shifts, emps));
    expect(out.proposals).toHaveLength(shiftCount);
    const load = loadByEmp(out.proposals);
    for (const e of emps) expect(load.get(e)).toBe(perEmp);
    expect(out.unfilledShiftIds).toEqual([]);
  });
});

describe('Greedy distribution grid — uneven spread (remainder)', () => {
  // S not divisible by E: some employees carry one extra; total still == S and
  // max-min load differs by exactly 1.
  type Row = [name: string, empCount: number, shiftCount: number];
  const rows: Row[] = [
    ['2 emps, 3 shifts', 2, 3],
    ['2 emps, 5 shifts', 2, 5],
    ['3 emps, 4 shifts', 3, 4],
    ['3 emps, 5 shifts', 3, 5],
    ['3 emps, 7 shifts', 3, 7],
    ['4 emps, 6 shifts', 4, 6],
    ['4 emps, 7 shifts', 4, 7],
    ['5 emps, 7 shifts', 5, 7],
  ];
  it.each(rows)('%s -> total==S, balanced within 1', async (_n, empCount, shiftCount) => {
    const emps = Array.from({ length: empCount }, (_, i) => `e${i + 1}`);
    const shifts = Array.from({ length: shiftCount }, (_, i) => makeShift(`s${i}`, ...DAY(1 + i)));
    const out = await run(fullMatrix(shifts, emps));
    expect(out.proposals).toHaveLength(shiftCount);
    const load = loadByEmp(out.proposals);
    const counts = emps.map((e) => load.get(e) ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(shiftCount);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

// ---- requiredEmployeeCount fill exactly ----------------------------------
describe('Greedy requiredEmployeeCount — fills exactly when enough eligible', () => {
  type Row = [name: string, required: number, empCount: number, expectProposals: number, expectUnfilled: boolean];
  const rows: Row[] = [
    ['need 1 of 3', 1, 3, 1, false],
    ['need 2 of 3', 2, 3, 2, false],
    ['need 3 of 3', 3, 3, 3, false],
    ['need 3 of 5', 3, 5, 3, false],
    ['need 5 of 5', 5, 5, 5, false],
    ['need 4 of 2 -> short', 4, 2, 2, true],
    ['need 3 of 1 -> short', 3, 1, 1, true],
    ['need 2 of 1 -> short', 2, 1, 1, true],
  ];
  it.each(rows)('%s', async (_n, required, empCount, expectProposals, expectUnfilled) => {
    const emps = Array.from({ length: empCount }, (_, i) => `e${i + 1}`);
    const shift = makeShift('multi', ...DAY(7), { requiredEmployeeCount: required });
    const out = await run(fullMatrix([shift], emps));
    expect(out.proposals).toHaveLength(expectProposals);
    // distinct employees only — never the same employee twice on one shift
    expect(new Set(out.proposals.map((p) => p.employeeId)).size).toBe(expectProposals);
    expect(out.unfilledShiftIds).toEqual(expectUnfilled ? ['multi'] : []);
  });
});

// ---- same-day avoidance grids --------------------------------------------
describe('Greedy same-day avoidance — distinct employees on same local day', () => {
  // SAME_DAY_PENALTY 1.0 >> SPREAD_PENALTY 0.2, so two non-overlapping shifts on
  // the same local day go to different employees when an alternative is free.
  // All on 2026-06-07: morning 05:00-11:00Z, evening 13:00-19:00Z (no overlap).
  type Row = [name: string, empCount: number];
  const rows: Row[] = [
    ['2 employees', 2],
    ['3 employees', 3],
    ['4 employees', 4],
  ];
  it.each(rows)('%s -> am and pm differ', async (_n, empCount) => {
    const emps = Array.from({ length: empCount }, (_, i) => `e${i + 1}`);
    const am = makeShift('am', '2026-06-07T05:00:00Z', '2026-06-07T11:00:00Z');
    const pm = makeShift('pm', '2026-06-07T13:00:00Z', '2026-06-07T19:00:00Z');
    const out = await run(fullMatrix([am, pm], emps));
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    expect(out.proposals).toHaveLength(2);
    expect(byShift.get('am')).not.toBe(byShift.get('pm'));
  });

  it('falls back to same employee on same day when no alternative is free', async () => {
    const am = makeShift('am', '2026-06-07T05:00:00Z', '2026-06-07T11:00:00Z');
    const pm = makeShift('pm', '2026-06-07T13:00:00Z', '2026-06-07T19:00:00Z');
    const out = await run(fullMatrix([am, pm], ['e1']));
    expect(out.proposals).toHaveLength(2);
    expect(out.proposals.every((p) => p.employeeId === 'e1')).toBe(true);
    expect(out.unfilledShiftIds).toEqual([]);
  });
});

// ---- overlap hard constraint grids ---------------------------------------
describe('Greedy overlap hard constraint', () => {
  type Row = [name: string, empCount: number, expectUnfilledB: boolean];
  const rows: Row[] = [
    ['1 emp -> overlapping b unfilled', 1, true],
    ['2 emps -> b goes to the other', 2, false],
    ['3 emps -> b goes to a free one', 3, false],
  ];
  it.each(rows)('%s', async (_n, empCount, expectUnfilledB) => {
    const emps = Array.from({ length: empCount }, (_, i) => `e${i + 1}`);
    const a = makeShift('a', '2026-06-08T06:00:00Z', '2026-06-08T14:00:00Z');
    const b = makeShift('b', '2026-06-08T10:00:00Z', '2026-06-08T18:00:00Z'); // overlaps a
    const out = await run(fullMatrix([a, b], emps));
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    if (expectUnfilledB) {
      expect(byShift.has('b')).toBe(false);
      expect(out.unfilledShiftIds).toEqual(['b']);
    } else {
      expect(byShift.get('a')).not.toBe(byShift.get('b'));
      expect(out.unfilledShiftIds).toEqual([]);
    }
  });

  it('back-to-back (touching, not overlapping) shifts may share an employee when forced', async () => {
    // a ends 14:00Z, b starts 14:00Z -> start < end is false at the seam (no overlap).
    const a = makeShift('a', '2026-06-09T06:00:00Z', '2026-06-09T14:00:00Z');
    const b = makeShift('b', '2026-06-09T14:00:00Z', '2026-06-09T22:00:00Z');
    const out = await run(fullMatrix([a, b], ['e1']));
    expect(out.proposals).toHaveLength(2);
    expect(out.unfilledShiftIds).toEqual([]);
  });
});

// ---- all-ineligible shift -> in unfilledShiftIds -------------------------
describe('Greedy all-ineligible shift -> reported unfilled', () => {
  type Row = [name: string, eligibleFlags: boolean[], expectUnfilled: string[], expectProposals: number];
  const rows: Row[] = [
    ['zero eligible -> unfilled', [false, false], ['z'], 0],
    ['one eligible -> filled', [true, false], [], 1],
    ['all eligible -> filled', [true, true], [], 1],
  ];
  it.each(rows)('%s', async (_n, flags, expectUnfilled, expectProposals) => {
    const shift = makeShift('z', ...DAY(10));
    const cands = flags.map((f, i) => candidate(shift, `e${i + 1}`, f));
    const out = await run(cands);
    expect(out.proposals).toHaveLength(expectProposals);
    expect(out.unfilledShiftIds).toEqual(expectUnfilled);
  });

  it('mix of fully-eligible and zero-eligible shifts: only the empty one is unfilled', async () => {
    const good = makeShift('good', ...DAY(11));
    const bad = makeShift('bad', ...DAY(12));
    const cands = [
      candidate(good, 'e1', true),
      candidate(bad, 'e1', false),
      candidate(bad, 'e2', false),
    ];
    const out = await run(cands);
    expect(out.unfilledShiftIds).toEqual(['bad']);
    expect(out.stats.totalShifts).toBe(2); // both shifts counted in the universe
    expect(out.proposals).toHaveLength(1);
  });

  it('multi-slot shift with zero eligible is unfilled with no proposals', async () => {
    const shift = makeShift('multi', ...DAY(13), { requiredEmployeeCount: 3 });
    const out = await run([candidate(shift, 'e1', false)]);
    expect(out.proposals).toEqual([]);
    expect(out.unfilledShiftIds).toEqual(['multi']);
  });
});

// ---- scoring weight matrices flow through into proposal.score ------------
describe('Greedy proposal.score carries the STATIC scoreCandidate value', () => {
  // The proposal.score is the un-penalized scoring value (spread/same-day only
  // affect ranking, not the recorded score). Expected literals hand-derived above.
  type Row = [name: string, signals: Partial<CandidateSignals>, expected: number];
  const rows: Row[] = [
    ['neutral', {}, NEUTRAL], // 2.65/3.3
    ['preference 10', { preferenceScore: 10 }, 0.8787878787879], // 2.9/3.3
    ['preference -10', { preferenceScore: -10 }, 0.7272727272727], // 2.4/3.3
    ['fairness -3', { fairnessScore: -3 }, 0.9242424242424], // 3.05/3.3
    ['fairness 3', { fairnessScore: 3 }, 0.6818181818182], // 2.25/3.3
    ['availability 0', { availabilityCoverage: 0 }, 0.5], // 1.65/3.3
    ['weeklyHoursDelta 2400', { weeklyHoursDelta: 2400 }, 0.6818181818182], // 2.25/3.3
  ];
  it.each(rows)('%s -> proposal.score', async (_n, signals, expected) => {
    const shift = makeShift('one', ...DAY(14));
    const out = await run([candidate(shift, 'solo', true, { signals })]);
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]!.score).toBeCloseTo(expected, 9);
  });

  it('higher static score wins the single slot (preference 10 beats neutral)', async () => {
    const shift = makeShift('one', ...DAY(15));
    const cands = [
      candidate(shift, 'star', true, { signals: { preferenceScore: 10 } }),
      candidate(shift, 'plain', true),
    ];
    const out = await run(cands);
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]!.employeeId).toBe('star');
    expect(out.proposals[0]!.score).toBeCloseTo(0.8787878787879, 9); // 2.9/3.3
  });

  it('averageScore equals the mean of recorded proposal scores', async () => {
    const shifts = [makeShift('d1', ...DAY(1)), makeShift('d2', ...DAY(2))];
    const out = await run(fullMatrix(shifts, ['e1', 'e2']));
    const mean = out.proposals.reduce((s, p) => s + p.score, 0) / out.proposals.length;
    expect(out.stats.averageScore).toBeCloseTo(mean, 10);
    // all neutral -> mean == NEUTRAL
    expect(out.stats.averageScore).toBeCloseTo(NEUTRAL, 9);
  });
});

// ---- violations / warnings propagation into _candidateRows ---------------
describe('Greedy _candidateRows — violations/warnings counts propagate', () => {
  const W = (code: string): Candidate['warnings'][number] =>
    ({ ruleId: code, status: 'warn', message: code } as unknown as Candidate['warnings'][number]);
  const V = (code: string): Candidate['violations'][number] =>
    ({ ruleId: code, status: 'blocked', message: code } as unknown as Candidate['violations'][number]);

  type Row = [name: string, warnCount: number, violCount: number];
  const rows: Row[] = [
    ['0 warn, 0 viol', 0, 0],
    ['1 warn, 0 viol', 1, 0],
    ['2 warn, 0 viol', 2, 0],
    ['0 warn, 1 viol', 0, 1],
    ['2 warn, 3 viol', 2, 3],
    ['3 warn, 1 viol', 3, 1],
  ];
  it.each(rows)('%s -> row counts match', async (_n, warnCount, violCount) => {
    const shift = makeShift('one', ...DAY(16));
    const warnings = Array.from({ length: warnCount }, (_, i) => W(`w${i}`));
    const violations = Array.from({ length: violCount }, (_, i) => V(`v${i}`));
    // eligible so it gets scored into _candidateRows
    const out = await run([candidate(shift, 'e1', true, { warnings, violations })]);
    expect(out._candidateRows).toHaveLength(1);
    const row = out._candidateRows[0]!;
    expect(row.warningsCount).toBe(warnCount);
    expect(row.violationsCount).toBe(violCount);
    expect(row.shiftId).toBe('one');
    expect(row.employeeId).toBe('e1');
    expect(row.organizationId).toBe('org');
  });

  it('warnings flow onto the chosen proposal', async () => {
    const shift = makeShift('one', ...DAY(17));
    const warnings = [W('approaching-weekly-cap')];
    const out = await run([candidate(shift, 'e1', true, { warnings })]);
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]!.warnings).toHaveLength(1);
  });

  it('ineligible candidates are excluded from _candidateRows entirely', async () => {
    const shift = makeShift('one', ...DAY(18));
    const out = await run([
      candidate(shift, 'e1', true, { warnings: [W('x')] }),
      candidate(shift, 'e2', false, { violations: [V('blocked')] }),
    ]);
    // only the eligible one is scored -> one row
    expect(out._candidateRows).toHaveLength(1);
    expect(out._candidateRows[0]!.employeeId).toBe('e1');
  });

  it('eligibilityScore in the row equals the static scoreCandidate value', async () => {
    const shift = makeShift('one', ...DAY(19));
    const out = await run([candidate(shift, 'e1', true, { signals: { fairnessScore: -3 } })]);
    expect(out._candidateRows[0]!.eligibilityScore).toBeCloseTo(0.9242424242424, 9); // 3.05/3.3
  });
});

// ---- empty / degenerate inputs -------------------------------------------
describe('Greedy degenerate inputs', () => {
  it('no candidates at all -> empty everything, averageScore 0', async () => {
    const out = await run([]);
    expect(out.proposals).toEqual([]);
    expect(out.unfilledShiftIds).toEqual([]);
    expect(out.stats.totalShifts).toBe(0);
    expect(out.stats.proposalsGenerated).toBe(0);
    expect(out.stats.averageScore).toBe(0);
    expect(out._candidateRows).toEqual([]);
  });

  it('providerName is greedy and scheduleId echoes the input', async () => {
    const out = await run([candidate(makeShift('x', ...DAY(20)), 'e1', true)]);
    expect(out.providerName).toBe('greedy');
    expect(out.scheduleId).toBe('s');
  });
});
