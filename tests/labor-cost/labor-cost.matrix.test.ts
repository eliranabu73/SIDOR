/* eslint-disable @typescript-eslint/no-explicit-any */
//
// WAGE MATRIX — table-driven precision tests for labor-cost.service.ts.
//
// All money is INTEGER agorot, all time is INTEGER minutes. Every expected
// value in a table is a HAND-COMPUTED literal (see the comment beside it) — we
// never recompute it by calling the same source formula (no tautologies).
//
// Money model under test (labor-cost.service.ts):
//   rateAgorot          = Math.round(Number(hourlyRate) * 100)
//   DEFAULT_RATE_AGOROT = 35 * 100 = 3500       (when rate not finite or <= 0)
//   durationMinutes     = Math.round((end - start) / 60000)
//   costAgorot(m, r)    = Math.round((m * r) / 60)
//   ilsOf(agorot)       = agorot / 100
//   hoursOf(min)        = round(min / 60, 2)
//   OVERTIME_MINUTES    = 42 * 60 = 2520        (strictly greater => overtime)
//   valid rate          <=> Number.isFinite(n) && n > 0
//
// Determinism: every shift is pinned to a fixed summer week starting
// 2026-06-07 (Asia/Jerusalem = UTC+3). We pass UTC instants directly so the
// service's UTC-based arithmetic is fully deterministic regardless of TZ.
//
jest.mock('../../src/db/prisma', () => ({ prisma: {} }));

import { Prisma } from '@prisma/client';
import { fetchLaborCostForWeek } from '../../src/modules/labor-cost/labor-cost.service';

// Summer week, Sunday 2026-06-07 00:00:00Z. weekStart..+7d window.
const WEEK_START = new Date('2026-06-07T00:00:00.000Z');
const ORG = 'org-matrix';

// --- fake db builder (same pattern as labor-cost.service.test.ts) --------

type Assignment = {
  assignmentStatus?: string;
  employee: { id: string; fullName: string; hourlyRate?: any };
};
type Shift = {
  id?: string;
  startAtUtc: Date;
  endAtUtc: Date;
  status?: string;
  requiredEmployeeCount?: number | null;
  role?: { name: string } | null;
  location?: { name: string } | null;
  assignments: Assignment[];
};

let _seq = 0;
function makeShift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-' + ++_seq,
    startAtUtc: new Date('2026-06-07T08:00:00.000Z'),
    endAtUtc: new Date('2026-06-07T14:00:00.000Z'), // 360 min
    status: 'PUBLISHED',
    requiredEmployeeCount: 1,
    role: { name: 'מלצר' },
    location: { name: 'סניף מרכז' },
    assignments: [],
    ...over,
  };
}

function emp(id: string, rate?: any, name = 'עובד ' + id): Assignment {
  return { assignmentStatus: 'CONFIRMED', employee: { id, fullName: name, hourlyRate: rate } };
}

const COUNTED = new Set(['CONFIRMED', 'COMPLETED', 'PROPOSED']);
function fakeDb(shifts: Shift[], opts: { throwP2022?: boolean; throwOther?: boolean } = {}) {
  let calls = 0;
  return {
    _calls: () => calls,
    shift: {
      findMany: async (args: any) => {
        calls += 1;
        const includeRate =
          !!args?.include?.assignments?.include?.employee?.select?.hourlyRate;
        if (opts.throwOther) throw Object.assign(new Error('boom'), { code: 'P9999' });
        if (opts.throwP2022 && includeRate) {
          throw Object.assign(new Error('column missing'), { code: 'P2022' });
        }
        const { gte, lt } = args.where.startAtUtc;
        return shifts
          .filter(
            (s) =>
              s.startAtUtc.getTime() >= gte.getTime() &&
              s.startAtUtc.getTime() < lt.getTime() &&
              (s.status ?? 'PUBLISHED') !== 'CANCELLED',
          )
          .map((s) => ({
            ...s,
            assignments: s.assignments
              .filter((a) => COUNTED.has(a.assignmentStatus ?? 'CONFIRMED'))
              .map((a) => ({
                assignmentStatus: a.assignmentStatus ?? 'CONFIRMED',
                employee: includeRate
                  ? a.employee
                  : { id: a.employee.id, fullName: a.employee.fullName },
              })),
          }));
      },
    },
  } as any;
}

const run = (shifts: Shift[], opts?: any) =>
  fetchLaborCostForWeek({ organizationId: ORG, weekStart: WEEK_START }, fakeDb(shifts, opts));

// Build a single-shift week of `dur` minutes at hourly rate `rate`.
function oneShift(dur: number, rate: any, over: Partial<Shift> = {}) {
  const start = new Date('2026-06-07T06:00:00.000Z');
  return run([
    makeShift({
      startAtUtc: start,
      endAtUtc: new Date(start.getTime() + dur * 60_000),
      assignments: [emp('e1', rate)],
      ...over,
    }),
  ]);
}

const agOf = (ils: number) => Math.round(ils * 100); // ILS result -> agorot integer

// ========================================================================
// (a) it.each matrix: [minutes, rateILS] -> HAND-COMPUTED agorot literal
//     literal = round(minutes * round(rateILS*100) / 60). Each verified by hand.
// ========================================================================
describe('cost matrix [minutes, rateILS] -> exact agorot (hand-computed)', () => {
  const cases: Array<[number, number, number]> = [
    // 60 min @ rate => agorot == rateAgorot exactly
    [60, 40, 4000], // 60*4000/60 = 4000
    [60, 35, 3500], // = 3500
    [60, 52.5, 5250], // rate 5250
    [60, 100, 10000],
    [60, 0.01, 1], // rate 1 agorot/hr -> round(1)=1
    // 30 min => half the hourly rate
    [30, 40, 2000], // 30*4000/60 = 2000
    [30, 35, 1750],
    [30, 52.5, 2625],
    [30, 33, 1650],
    // 90 min => 1.5 x rate
    [90, 40, 6000], // 90*4000/60 = 6000
    [90, 52.5, 7875], // 90*5250/60 = 7875
    [120, 40, 8000], // 2h
    [450, 52.5, 39375], // 450*5250/60 = 2362500/60 = 39375
    [360, 35.5, 21300], // 360*3550/60 = 21300
    [300, 41.17, 20585], // 300*4117/60 = 1235100/60 = 20585
    [210, 35.5, 12425], // 210*3550/60 = 745500/60 = 12425
    [480, 50, 40000], // 8h@50
    [480, 30, 24000], // 8h@30
    [1, 50, 83], // 1*5000/60 = 83.33 -> 83
    [1, 60, 100], // 6000/60 = 100
    [7, 33.33, 389], // 7*3333/60 = 23331/60 = 388.85 -> 389
    [13, 41.17, 892], // 13*4117/60 = 53521/60 = 892.0167 -> 892
    [125, 29.99, 6248], // 125*2999/60 = 374875/60 = 6247.9 -> 6248
    [45, 44.44, 3333], // 45*4444/60 = 199980/60 = 3333.0 -> 3333
    [240, 37.25, 14900], // 240*3725/60 = 894000/60 = 14900
    [15, 80, 2000], // 15*8000/60 = 2000
    [5, 36, 300], // 5*3600/60 = 300
    [200, 22.5, 7500], // 200*2250/60 = 450000/60 = 7500
    [333, 33.33, 18498], // 333*3333/60 = 1109889/60 = 18498.15 -> 18498
  ];

  it.each(cases)('%i min @ %p ILS -> %i agorot', async (min, rate, expAg) => {
    const r = await oneShift(min, rate);
    expect(agOf(r.totals.cost)).toBe(expAg);
  });

  // 90 @ 33.33 special: confirm the .5 rounds up (banker's rounding NOT used)
  it('90 min @ 33.33 rounds 4999.5 -> 5000 (Math.round half-up)', async () => {
    const r = await oneShift(90, 33.33);
    expect(agOf(r.totals.cost)).toBe(5000);
  });
});

// Math.round is half-UP (not banker's). These rows have a raw product ending
// in exactly .5 — assert they round up, not to nearest-even.
describe('cost matrix — Math.round half-up boundary cases', () => {
  // [min, rateIls, expectedAgorot] where the raw product ends in .5
  const half: Array<[number, number, number]> = [
    [90, 33.33, 5000], // 299970/60 = 4999.5 -> 5000
    [30, 0.01, 1], // 30*1/60 = 0.5 -> 1
    [90, 0.01, 2], // 90*1/60 = 1.5 -> 2
    [150, 0.01, 3], // 150*1/60 = 2.5 -> 3
    [210, 0.01, 4], // 210*1/60 = 3.5 -> 4
  ];
  it.each(half)('%i min @ %p -> %i agorot (half rounds up)', async (min, rate, exp) => {
    const r = await oneShift(min, rate);
    expect(agOf(r.totals.cost)).toBe(exp);
  });
});

// ========================================================================
// (b) Decimal vs number-string vs number rate produce identical cost.
// ========================================================================
describe('rate representation equivalence (number === string === Decimal)', () => {
  // [label, durationMin, rateForms, expectedAgorot]
  const forms: Array<[number, number, any[]]> = [
    [60, 4000, [40, '40', new Prisma.Decimal('40'), new Prisma.Decimal(40)]],
    [360, 21300, [35.5, '35.5', new Prisma.Decimal('35.5')]], // 360*3550/60
    [300, 20585, [41.17, '41.17', new Prisma.Decimal('41.17')]],
    [60, 5250, [52.5, '52.5', new Prisma.Decimal('52.50')]],
    [120, 8500, [42.5, '42.5', new Prisma.Decimal('42.5')]], // 120*4250/60=8500
  ];

  for (const [dur, expAg, rates] of forms) {
    it.each(rates.map((rt, i) => [i, rt] as [number, any]))(
      `${dur}min -> ${expAg} agorot for rate form #%i`,
      async (_i, rate) => {
        const r = await oneShift(dur, rate);
        expect(agOf(r.totals.cost)).toBe(expAg);
      },
    );
  }
});

// ========================================================================
// (c) invalid rates -> DEFAULT 3500 agorot + employeesWithoutRate++
//     60 min so cost == rateAgorot exactly => 3500 agorot = 35 ILS.
// ========================================================================
describe('invalid rate -> default 3500 agorot + counted withoutRate', () => {
  const invalid: Array<[string, any]> = [
    ['zero number', 0],
    ['negative -5', -5],
    ['negative -0.01', -0.01],
    ['NaN', NaN],
    ['empty string', ''],
    ['blank spaces', '   '], // Number('   ') === 0 -> invalid
    ['non-numeric N/A', 'N/A'],
    ['non-numeric abc', 'abc'],
    ['null', null],
    ['undefined', undefined],
    ['Decimal(0)', new Prisma.Decimal(0)],
    ['Decimal(-3)', new Prisma.Decimal(-3)],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['boolean false (Number->0)', false],
  ];

  it.each(invalid)('rate %s -> 35 ILS, hourlyRate null, withoutRate=1', async (_l, rate) => {
    const r = await oneShift(60, rate);
    expect(r.totals.cost).toBe(35); // 3500 agorot
    expect(r.totals.employeesWithoutRate).toBe(1);
    expect(r.perEmployee[0]!.hourlyRate).toBeNull();
    expect(Number.isFinite(r.totals.cost)).toBe(true);
    expect(Number.isFinite(r.totals.hours)).toBe(true);
  });

  // Valid rates that should NOT be defaulted.
  const valid: Array<[string, any, number]> = [
    ['number 0.01', 0.01, 1], // 60min -> 1 agorot
    ['string "0.01"', '0.01', 1],
    ['number 35', 35, 3500],
    ['Decimal("0.5")', new Prisma.Decimal('0.5'), 50], // 60min@0.5 = 50 agorot
    ['large 1000', 1000, 100000],
    ['string "  42.5  " trimmed', '  42.5  ', 4250], // Number trims whitespace
  ];
  it.each(valid)('valid rate %s honoured (no default)', async (_l, rate, expAg) => {
    const r = await oneShift(60, rate);
    expect(agOf(r.totals.cost)).toBe(expAg);
    expect(r.totals.employeesWithoutRate).toBe(0);
  });
});

// ========================================================================
// (d) zero / negative-duration shift (end <= start) — assert ACTUAL behavior.
// ========================================================================
describe('zero / negative duration shifts (end <= start) — actual behavior', () => {
  it('end == start -> 0 minutes, 0 cost', async () => {
    const t = new Date('2026-06-07T08:00:00.000Z');
    const r = await run([makeShift({ startAtUtc: t, endAtUtc: t, assignments: [emp('e1', 40)] })]);
    expect(r.totals.cost).toBe(0);
    expect(r.totals.hours).toBe(0);
    expect(r.perEmployee[0]!.cost).toBe(0);
  });

  // end < start -> durationMinutes is CLAMPED to 0 (Math.max(0,...)), so a
  // malformed shift contributes 0 cost and can NEVER reduce the weekly wage
  // bill. Regression guard for the negative-duration fix.
  const neg: Array<[number, number]> = [
    // [negativeDurMin, rateIls] -> always 0 agorot after clamp
    [-60, 40],
    [-30, 50],
    [-360, 35.5],
    [-1, 60],
  ];
  it.each(neg)('end<start by %i min @ %p -> 0 agorot (clamped, not negative)', async (dur, rate) => {
    const start = new Date('2026-06-07T12:00:00.000Z');
    const r = await run([
      makeShift({
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + dur * 60_000), // dur negative => before start
        assignments: [emp('e1', rate)],
      }),
    ]);
    expect(agOf(r.totals.cost)).toBe(0);
    expect(r.totals.cost).toBeGreaterThanOrEqual(0); // never negative
  });

  it('a malformed (end<start) shift cannot cancel a real positive shift', async () => {
    const a = new Date('2026-06-07T08:00:00.000Z');
    const b = new Date('2026-06-08T12:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: a, endAtUtc: new Date(a.getTime() + 60 * 60_000), assignments: [emp('e1', 40)] }), // +4000
      makeShift({ startAtUtc: b, endAtUtc: new Date(b.getTime() - 60 * 60_000), assignments: [emp('e1', 40)] }), // clamped to 0
    ]);
    // +4000 + 0 = 4000 agorot — the real shift survives.
    expect(agOf(r.totals.cost)).toBe(4000);
  });
});

// ========================================================================
// (e) drift: 500 shifts of 7 min @ 33.33 — total finite + exact integer.
// ========================================================================
describe('zero-drift summation across 500 odd-minute shifts', () => {
  it('500 x (7 min @ 33.33) accumulates exactly with no float drift', async () => {
    // Per-shift agorot = round(7*3333/60) = round(388.85) = 389 (hand-computed).
    const PER = 389;
    const N = 500;
    const shifts: Shift[] = [];
    for (let i = 0; i < N; i++) {
      // spread across the week so all land inside [weekStart, +7d)
      const start = new Date(WEEK_START.getTime() + i * 60_000 + 6 * 3600_000);
      shifts.push(
        makeShift({
          startAtUtc: start,
          endAtUtc: new Date(start.getTime() + 7 * 60_000),
          assignments: [emp('worker', 33.33)], // same employee -> single bucket
        }),
      );
    }
    const r = await run(shifts);
    expect(Number.isFinite(r.totals.cost)).toBe(true);
    expect(agOf(r.totals.cost)).toBe(PER * N); // 389 * 500 = 194500 agorot
    expect(r.totals.cost).toBe(1945); // 194500 / 100
    expect(r.perEmployee).toHaveLength(1);
    expect(agOf(r.perEmployee[0]!.cost)).toBe(PER * N);
    // total minutes = 7 * 500 = 3500 -> 58.333.. h -> round 58.33
    expect(r.totals.hours).toBe(58.33);
  });

  it('200 x (1 min @ 50) — per-shift round(83.33)=83 -> 16600 agorot, not single-round', async () => {
    const PER = 83; // round(1*5000/60)
    const N = 200;
    const shifts: Shift[] = [];
    for (let i = 0; i < N; i++) {
      const start = new Date(WEEK_START.getTime() + i * 120_000 + 6 * 3600_000);
      shifts.push(
        makeShift({
          startAtUtc: start,
          endAtUtc: new Date(start.getTime() + 60_000),
          assignments: [emp('e1', 50)],
        }),
      );
    }
    const r = await run(shifts);
    expect(agOf(r.totals.cost)).toBe(PER * N); // 16600
  });
});

// ========================================================================
// (f) per-day / per-role / per-location aggregation matrices summing to totals.
// ========================================================================
describe('aggregation buckets sum to totals (per-day / per-role / per-location)', () => {
  // A fixed week of shifts spanning 3 days, 3 roles, 2 locations.
  function week() {
    const d = (iso: string) => new Date(iso);
    return [
      // 2026-06-07: waiter @35.5 360min, cook @41.17 300min
      makeShift({
        startAtUtc: d('2026-06-07T08:00:00.000Z'),
        endAtUtc: d('2026-06-07T14:00:00.000Z'), // 360
        role: { name: 'מלצר' },
        location: { name: 'L1' },
        assignments: [emp('a', 35.5)], // 360*3550/60 = 21300
      }),
      makeShift({
        startAtUtc: d('2026-06-07T15:00:00.000Z'),
        endAtUtc: d('2026-06-07T20:00:00.000Z'), // 300
        role: { name: 'טבח' },
        location: { name: 'L2' },
        assignments: [emp('b', 41.17)], // 300*4117/60 = 20585
      }),
      // 2026-06-08: waiter @35.5 210min
      makeShift({
        startAtUtc: d('2026-06-08T08:00:00.000Z'),
        endAtUtc: d('2026-06-08T11:30:00.000Z'), // 210
        role: { name: 'מלצר' },
        location: { name: 'L1' },
        assignments: [emp('a', 35.5)], // 210*3550/60 = 12425
      }),
      // 2026-06-09: manager @50 480min
      makeShift({
        startAtUtc: d('2026-06-09T08:00:00.000Z'),
        endAtUtc: d('2026-06-09T16:00:00.000Z'), // 480
        role: { name: 'מנהל' },
        location: { name: 'L2' },
        assignments: [emp('c', 50)], // 480*5000/60 = 40000
      }),
    ];
  }
  // Hand totals: 21300 + 20585 + 12425 + 40000 = 94310 agorot
  const TOTAL = 94310;

  it('per-day sums to total; days sorted ascending', async () => {
    const r = await run(week());
    expect(r.perDay.map((d) => d.date)).toEqual(['2026-06-07', '2026-06-08', '2026-06-09']);
    expect(r.perDay.reduce((s, x) => s + agOf(x.cost), 0)).toBe(TOTAL);
    // day 07: 21300 + 20585 = 41885
    expect(agOf(r.perDay.find((d) => d.date === '2026-06-07')!.cost)).toBe(41885);
    // day 08: 12425
    expect(agOf(r.perDay.find((d) => d.date === '2026-06-08')!.cost)).toBe(12425);
    // day 09: 40000
    expect(agOf(r.perDay.find((d) => d.date === '2026-06-09')!.cost)).toBe(40000);
  });

  it('per-role sums to total with hand-computed role costs', async () => {
    const r = await run(week());
    expect(r.perRole.reduce((s, x) => s + agOf(x.cost), 0)).toBe(TOTAL);
    // מלצר: 21300 + 12425 = 33725
    expect(agOf(r.perRole.find((x) => x.name === 'מלצר')!.cost)).toBe(33725);
    expect(agOf(r.perRole.find((x) => x.name === 'טבח')!.cost)).toBe(20585);
    expect(agOf(r.perRole.find((x) => x.name === 'מנהל')!.cost)).toBe(40000);
  });

  it('per-location sums to total with hand-computed location costs', async () => {
    const r = await run(week());
    expect(r.perLocation.reduce((s, x) => s + agOf(x.cost), 0)).toBe(TOTAL);
    // L1: 21300 + 12425 = 33725 ; L2: 20585 + 40000 = 60585
    expect(agOf(r.perLocation.find((x) => x.name === 'L1')!.cost)).toBe(33725);
    expect(agOf(r.perLocation.find((x) => x.name === 'L2')!.cost)).toBe(60585);
  });

  it('per-employee sums to total; sorted by cost desc', async () => {
    const r = await run(week());
    expect(r.perEmployee.reduce((s, x) => s + agOf(x.cost), 0)).toBe(TOTAL);
    expect(r.perEmployee.map((e) => e.employeeId)).toEqual(['c', 'a', 'b']);
    // a: 21300 + 12425 = 33725 ; b: 20585 ; c: 40000
    expect(agOf(r.perEmployee.find((e) => e.employeeId === 'a')!.cost)).toBe(33725);
    expect(agOf(r.perEmployee.find((e) => e.employeeId === 'b')!.cost)).toBe(20585);
    expect(agOf(r.perEmployee.find((e) => e.employeeId === 'c')!.cost)).toBe(40000);
    expect(agOf(r.totals.cost)).toBe(TOTAL);
  });

  it('null role/location fall back to Hebrew defaults and still sum', async () => {
    const d = (iso: string) => new Date(iso);
    const r = await run([
      makeShift({
        startAtUtc: d('2026-06-07T08:00:00.000Z'),
        endAtUtc: d('2026-06-07T14:00:00.000Z'),
        role: null,
        location: null,
        assignments: [emp('a', 40)], // 360*4000/60 = 24000
      }),
    ]);
    expect(agOf(r.perRole.find((x) => x.name === 'ללא תפקיד')!.cost)).toBe(24000);
    expect(agOf(r.perLocation.find((x) => x.name === 'ללא סניף')!.cost)).toBe(24000);
  });
});

// ========================================================================
// (g) overtime 2520 boundary grid.
// ========================================================================
describe('overtime threshold grid (OVERTIME_MINUTES=2520, strict >)', () => {
  const grid: Array<[number, boolean]> = [
    [0, false],
    [60, false],
    [2400, false],
    [2519, false],
    [2520, false], // exactly 42h is NOT overtime
    [2521, true], // one minute over
    [2580, true],
    [3000, true],
    [10080, true], // whole week
  ];
  it.each(grid)('%i total minutes -> isOvertime=%s', async (minutes, expected) => {
    const start = new Date('2026-06-07T00:00:00.000Z');
    const r = await run([
      makeShift({
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + minutes * 60_000),
        requiredEmployeeCount: 1,
        assignments: [emp('e1', 35)],
      }),
    ]);
    if (minutes === 0) {
      // zero-duration shift still creates the employee bucket with 0 minutes
      expect(r.perEmployee[0]!.isOvertime).toBe(false);
    } else {
      expect(r.perEmployee[0]!.isOvertime).toBe(expected);
    }
    expect(r.totals.overtimeEmployees).toBe(expected ? 1 : 0);
  });

  it('overtime accumulates across split shifts (1260 + 1261 = 2521 > 2520)', async () => {
    const s1 = new Date('2026-06-07T00:00:00.000Z');
    const s2 = new Date('2026-06-09T00:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: s1, endAtUtc: new Date(s1.getTime() + 1260 * 60_000), assignments: [emp('e1', 35)] }),
      makeShift({ startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 1261 * 60_000), assignments: [emp('e1', 35)] }),
    ]);
    expect(r.perEmployee[0]!.isOvertime).toBe(true);
    expect(r.totals.overtimeEmployees).toBe(1);
  });

  it('split shifts summing to exactly 2520 are NOT overtime', async () => {
    const s1 = new Date('2026-06-07T00:00:00.000Z');
    const s2 = new Date('2026-06-09T00:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: s1, endAtUtc: new Date(s1.getTime() + 1260 * 60_000), assignments: [emp('e1', 35)] }),
      makeShift({ startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 1260 * 60_000), assignments: [emp('e1', 35)] }),
    ]);
    expect(r.perEmployee[0]!.isOvertime).toBe(false);
    expect(r.totals.overtimeEmployees).toBe(0);
  });

  it('counts multiple overtime employees independently', async () => {
    const start = new Date('2026-06-07T00:00:00.000Z');
    const long = new Date(start.getTime() + 2600 * 60_000);
    const r = await run([
      makeShift({ startAtUtc: start, endAtUtc: long, assignments: [emp('a', 35), emp('b', 40)] }),
      makeShift({ startAtUtc: start, endAtUtc: new Date(start.getTime() + 60 * 60_000), assignments: [emp('c', 35)] }),
    ]);
    expect(r.totals.overtimeEmployees).toBe(2); // a and b, not c
  });
});

// ========================================================================
// duration rounding (sub-minute) grid.
// ========================================================================
describe('duration rounding to nearest minute (round((end-start)/60000))', () => {
  // [extraSeconds beyond 90 min, expectedMinutes]
  const grid: Array<[number, number]> = [
    [0, 90],
    [29, 90], // 90.483 -> 90
    [30, 91], // 90.5 -> 91 (half up)
    [59, 91], // 90.983 -> 91
    [60, 91], // exactly 91 min
    [89, 91], // 91.483 -> 91
    [90, 92], // 91.5 -> 92
  ];
  it.each(grid)('90min + %i sec -> %i min charged @ 60 ILS (1 ILS/min)', async (sec, expMin) => {
    const start = new Date('2026-06-07T08:00:00.000Z');
    const r = await run([
      makeShift({
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + 90 * 60_000 + sec * 1000),
        assignments: [emp('e1', 60)], // 60 ILS/h => 100 agorot/min => cost agorot == minutes*100
      }),
    ]);
    // cost agorot = expMin * 100 (since 60 ILS/hr). Hand: minutes*6000/60 = minutes*100.
    expect(agOf(r.totals.cost)).toBe(expMin * 100);
  });
});

// ========================================================================
// hoursOf rounding (2 decimal places) grid.
// ========================================================================
describe('hoursOf output rounding to 2 decimals', () => {
  const grid: Array<[number, number]> = [
    [60, 1], // 1.0
    [90, 1.5],
    [100, 1.67], // 1.6666 -> 1.67
    [50, 0.83], // 0.8333 -> 0.83
    [40, 0.67], // 0.6666 -> 0.67
    [10, 0.17], // 0.1666 -> 0.17
    [125, 2.08], // 2.0833 -> 2.08
    [3500, 58.33], // 58.333 -> 58.33
  ];
  it.each(grid)('%i min -> %p hours', async (min, expH) => {
    const start = new Date('2026-06-07T06:00:00.000Z');
    const r = await run([
      makeShift({
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + min * 60_000),
        assignments: [emp('e1', 35)],
      }),
    ]);
    expect(r.totals.hours).toBe(expH);
    expect(r.perEmployee[0]!.hours).toBe(expH);
  });
});

// ========================================================================
// open / uncovered grid.
// ========================================================================
describe('openShifts / uncovered grid', () => {
  // [required, assignedCount, expectedOpen, expectedUncoveredHoursFor360minShift]
  const grid: Array<[number, number, number, number]> = [
    [1, 0, 1, 6], // 360*1/60
    [1, 1, 0, 0],
    [2, 0, 2, 12], // 360*2/60
    [2, 1, 1, 6],
    [2, 2, 0, 0],
    [3, 1, 2, 12],
    [3, 3, 0, 0],
    [5, 2, 3, 18], // 360*3/60
    [2, 3, 0, 0], // over-staffed -> no negative open
  ];
  it.each(grid)('required=%i assigned=%i -> open=%i uncoveredH=%i', async (req, assigned, open, unc) => {
    const start = new Date('2026-06-07T08:00:00.000Z');
    const assignments = Array.from({ length: assigned }, (_, i) => emp('e' + i, 35));
    const r = await run([
      makeShift({
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + 360 * 60_000),
        requiredEmployeeCount: req,
        assignments,
      }),
    ]);
    expect(r.totals.openShifts).toBe(open);
    expect(r.totals.uncoveredHours).toBe(unc);
    expect(r.totals.employees).toBe(assigned);
  });

  it('null requiredEmployeeCount defaults to 1', async () => {
    const r = await run([makeShift({ requiredEmployeeCount: null, assignments: [] })]);
    expect(r.totals.openShifts).toBe(1);
    expect(r.totals.uncoveredHours).toBe(6);
  });
});

// ========================================================================
// employeesWithoutRate dedup grid.
// ========================================================================
describe('employeesWithoutRate dedup counting', () => {
  it('each rate-less employee counted once across many shifts', async () => {
    const d = (iso: string) => new Date(iso);
    const r = await run([
      makeShift({
        startAtUtc: d('2026-06-07T08:00:00.000Z'),
        endAtUtc: d('2026-06-07T10:00:00.000Z'),
        assignments: [emp('x', null), emp('y', 0)],
      }),
      makeShift({
        startAtUtc: d('2026-06-08T08:00:00.000Z'),
        endAtUtc: d('2026-06-08T10:00:00.000Z'),
        assignments: [emp('x', NaN), emp('z', 40)], // x again, z valid
      }),
      makeShift({
        startAtUtc: d('2026-06-09T08:00:00.000Z'),
        endAtUtc: d('2026-06-09T10:00:00.000Z'),
        assignments: [emp('w', 'N/A')],
      }),
    ]);
    expect(r.totals.employeesWithoutRate).toBe(3); // x (once), y, w. z is rated.
  });

  it('is zero when everyone has a valid rate', async () => {
    const r = await run([makeShift({ assignments: [emp('a', 35), emp('b', 40)] })]);
    expect(r.totals.employeesWithoutRate).toBe(0);
  });

  // grid: distinct employee ids (emp0..) each with given rate -> count of
  // distinct unrated employees. (ids are distinct, so no dedup here.)
  const grid: Array<[any[], number]> = [
    [[null], 1],
    [[null, null], 2], // two DISTINCT ids both unrated
    [[0, -1, NaN], 3],
    [[40, 50], 0],
    [[40, null, 'x', 0], 3], // 40 valid, others invalid (3)
  ];
  it.each(grid)('rates %p -> withoutRate=%i', async (rates, expected) => {
    const assignments = (rates as any[]).map((rt, i) => emp('emp' + i, rt));
    const r = await run([makeShift({ assignments })]);
    expect(r.totals.employeesWithoutRate).toBe(expected);
  });
});

// ========================================================================
// P2022 degraded mode — everyone defaults.
// ========================================================================
describe('P2022 degraded mode (hourlyRate column missing)', () => {
  it('all employees billed at default 3500 regardless of stored rate', async () => {
    const d = (iso: string) => new Date(iso);
    const r = await run(
      [
        makeShift({
          startAtUtc: d('2026-06-07T08:00:00.000Z'),
          endAtUtc: d('2026-06-07T14:00:00.000Z'), // 360 -> 21000 @default
          assignments: [emp('a', 50)],
        }),
        makeShift({
          startAtUtc: d('2026-06-08T08:00:00.000Z'),
          endAtUtc: d('2026-06-08T14:00:00.000Z'), // 360 -> 21000
          assignments: [emp('b', 99)],
        }),
      ],
      { throwP2022: true },
    );
    expect(agOf(r.totals.cost)).toBe(42000); // 21000 + 21000
    expect(r.perEmployee.every((e) => e.hourlyRate === null)).toBe(true);
    expect(r.totals.employeesWithoutRate).toBe(2);
  });

  it('rethrows non-P2022 errors unchanged', async () => {
    await expect(run([makeShift()], { throwOther: true })).rejects.toThrow('boom');
  });
});

// ========================================================================
// metadata / empty week.
// ========================================================================
describe('metadata & empty week', () => {
  it('empty week -> all zeros', async () => {
    const r = await run([]);
    expect(r.totals).toMatchObject({
      hours: 0, cost: 0, shifts: 0, uncoveredHours: 0,
      openShifts: 0, employees: 0, overtimeEmployees: 0, employeesWithoutRate: 0,
    });
    expect(r.perEmployee).toEqual([]);
    expect(r.perDay).toEqual([]);
  });

  it('exposes currency / weekStart ISO / defaultHourlyRate', async () => {
    const r = await run([]);
    expect(r.currency).toBe('ILS');
    expect(r.weekStart).toBe(WEEK_START.toISOString());
    expect(r.defaultHourlyRate).toBe(35);
  });

  it('week window is [weekStart, +7d): includes start, excludes +7d', async () => {
    const r = await run([
      makeShift({
        startAtUtc: new Date('2026-06-07T00:00:00.000Z'), // exact start -> included
        endAtUtc: new Date('2026-06-07T06:00:00.000Z'),
        assignments: [emp('inA', 35)],
      }),
      makeShift({
        startAtUtc: new Date('2026-06-14T00:00:00.000Z'), // +7d -> excluded (lt)
        endAtUtc: new Date('2026-06-14T06:00:00.000Z'),
        assignments: [emp('out', 35)],
      }),
      makeShift({
        startAtUtc: new Date('2026-06-06T23:59:59.000Z'), // before start -> excluded
        endAtUtc: new Date('2026-06-07T05:00:00.000Z'),
        assignments: [emp('before', 35)],
      }),
    ]);
    expect(r.totals.shifts).toBe(1);
    expect(r.perEmployee[0]!.employeeId).toBe('inA');
  });
});
