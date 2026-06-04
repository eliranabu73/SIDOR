/* eslint-disable @typescript-eslint/no-explicit-any */
//
// WAGE / LABOR-COST PRECISION tests.
//
// Money is integer agorot, time is integer minutes; we assert REAL computed
// values (no tautologies). The service accepts a `db` param, so we inject a
// fake whose shift.findMany returns crafted shifts. NO real DB / network.
//
// Money model under test (from labor-cost.service.ts):
//   rateAgorot         = Math.round(Number(hourlyRate) * 100)
//   DEFAULT_RATE_AGOROT= 35 * 100 = 3500
//   durationMinutes    = round((end - start) / 60000)
//   costAgorot(m, r)   = Math.round((m * r) / 60)
//   ilsOf(agorot)      = agorot / 100
//   hoursOf(min)       = round(min / 60, 2)
//   OVERTIME_MINUTES   = 42 * 60 = 2520  (strictly greater than => overtime)
//
jest.mock('../../src/db/prisma', () => ({ prisma: {} }));

import { Prisma } from '@prisma/client';
import { fetchLaborCostForWeek } from '../../src/modules/labor-cost/labor-cost.service';

const WEEK_START = new Date('2026-06-01T00:00:00.000Z');
const ORG = 'org-test-1';

// --- fake db builder ----------------------------------------------------

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

function makeShift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-' + Math.random().toString(36).slice(2),
    startAtUtc: new Date('2026-06-01T08:00:00.000Z'),
    endAtUtc: new Date('2026-06-01T14:00:00.000Z'), // 360 min
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

// fake db: emulates the include.assignments.where status filter so the service
// only sees CONFIRMED/COMPLETED/PROPOSED assignments — matching real Prisma.
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
        // Apply week-window + status filter the way Prisma would.
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

// helpers replicating the money model for table-driven expectations
const costAgorot = (min: number, rateAgorot: number) => Math.round((min * rateAgorot) / 60);
const rateAg = (ils: number) => Math.round(ils * 100);

describe('fetchLaborCostForWeek — money model exactness', () => {
  it('360 min @ 35.50 ILS -> exact agorot/ILS', async () => {
    // rateAgorot = 3550; cost = round(360*3550/60) = round(21300) = 21300 agorot = 213 ILS
    const r = await run([
      makeShift({ assignments: [emp('e1', 35.5)] }),
    ]);
    expect(r.totals.cost).toBe(213);
    expect(r.totals.hours).toBe(6);
    expect(r.perEmployee[0]!.cost).toBe(213);
    expect(r.perEmployee[0]!.hourlyRate).toBe(35.5);
  });

  const cases: Array<[string, number, number, number]> = [
    // [label, durationMin, hourlyRateIls, expectedAgorot]
    ['1 min @ 35.555 (rate rounds to 3556)', 1, 35.555, costAgorot(1, rateAg(35.555))],
    ['7 min @ 33.33', 7, 33.33, costAgorot(7, rateAg(33.33))],
    ['90 min @ 40', 90, 40, 6000],
    ['90 min @ 40.01', 90, 40.01, costAgorot(90, 4001)],
    ['125 min @ 29.99', 125, 29.99, costAgorot(125, 2999)],
    ['1 min @ 50', 1, 50, costAgorot(1, 5000)], // round(5000/60)=83
    ['13 min @ 41.17', 13, 41.17, costAgorot(13, 4117)],
    ['600 min @ 35.50', 600, 35.5, costAgorot(600, 3550)],
  ];
  it.each(cases)('costAgorot exact: %s', async (_label, dur, ils, expAg) => {
    const start = new Date('2026-06-02T08:00:00.000Z');
    const end = new Date(start.getTime() + dur * 60_000);
    const r = await run([
      makeShift({ startAtUtc: start, endAtUtc: end, assignments: [emp('e1', ils)] }),
    ]);
    expect(Math.round(r.totals.cost * 100)).toBe(expAg);
    // hourlyRate echoed unrounded
    expect(r.perEmployee[0]!.hourlyRate).toBe(ils);
  });

  it('rate rounds via Math.round (35.555 -> 3556 agorot/hr)', async () => {
    expect(rateAg(35.555)).toBe(3556);
    const r = await run([
      // 60 min so cost == rateAgorot exactly
      makeShift({
        startAtUtc: new Date('2026-06-01T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-01T09:00:00.000Z'),
        assignments: [emp('e1', 35.555)],
      }),
    ]);
    expect(Math.round(r.totals.cost * 100)).toBe(3556);
  });
});

describe('fetchLaborCostForWeek — zero-drift summation', () => {
  it('sums many odd-minute shifts with no float drift', async () => {
    // Each shift 7 min @ 33.33 ILS (rate 3333). Per-shift agorot = round(7*3333/60)
    const per = costAgorot(7, 3333); // round(388.85)=389
    const N = 100;
    const shifts: Shift[] = [];
    for (let i = 0; i < N; i++) {
      const start = new Date(WEEK_START.getTime() + i * 60_000 + 8 * 3600_000);
      shifts.push(
        makeShift({
          startAtUtc: start,
          endAtUtc: new Date(start.getTime() + 7 * 60_000),
          assignments: [emp('worker', 33.33)], // same employee -> accumulates
        }),
      );
    }
    const r = await run(shifts);
    const expectedAgorot = per * N; // integer exact
    expect(Math.round(r.totals.cost * 100)).toBe(expectedAgorot);
    expect(r.totals.hours).toBe(Math.round((7 * N) / 60 * 100) / 100);
    // single employee aggregated
    expect(r.perEmployee).toHaveLength(1);
    expect(Math.round(r.perEmployee[0]!.cost * 100)).toBe(expectedAgorot);
  });

  it('per-shift rounding accumulates independently (not a single round at end)', async () => {
    // 5 shifts of 1 min @ 50 ILS: each = round(5000/60)=83 agorot => 415 agorot.
    // A naive "round at the end" would give round(5*5000/60)=round(416.6)=417. Assert 415.
    const shifts: Shift[] = [];
    for (let i = 0; i < 5; i++) {
      const start = new Date(WEEK_START.getTime() + i * 120_000 + 8 * 3600_000);
      shifts.push(
        makeShift({
          startAtUtc: start,
          endAtUtc: new Date(start.getTime() + 60_000),
          assignments: [emp('e1', 50)],
        }),
      );
    }
    const r = await run(shifts);
    expect(Math.round(r.totals.cost * 100)).toBe(415);
  });

  it('total agorot equals sum of per-employee agorot (cross-check)', async () => {
    const shifts = [
      makeShift({ assignments: [emp('a', 35.5)] }), // 360@3550 = 21300
      makeShift({
        startAtUtc: new Date('2026-06-02T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-02T13:00:00.000Z'), // 300 min
        assignments: [emp('b', 41.17)], // round(300*4117/60)=20585
      }),
      makeShift({
        startAtUtc: new Date('2026-06-03T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-03T11:30:00.000Z'), // 210 min
        assignments: [emp('a', 35.5)], // round(210*3550/60)=12425
      }),
    ];
    const r = await run(shifts);
    const sumEmp = r.perEmployee.reduce((s, e) => s + Math.round(e.cost * 100), 0);
    expect(Math.round(r.totals.cost * 100)).toBe(sumEmp);
    expect(Math.round(r.totals.cost * 100)).toBe(21300 + 20585 + 12425);
  });
});

describe('fetchLaborCostForWeek — overtime threshold boundary', () => {
  // OVERTIME = 2520 min (42h), strict >. Test 2519 / 2520 / 2521.
  it.each([
    [2519, false],
    [2520, false],
    [2521, true],
  ])('%i min -> isOvertime=%s', async (minutes, expected) => {
    const start = new Date('2026-06-01T06:00:00.000Z');
    const r = await run([
      makeShift({
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + minutes * 60_000),
        requiredEmployeeCount: 1,
        assignments: [emp('e1', 35)],
      }),
    ]);
    expect(r.perEmployee[0]!.isOvertime).toBe(expected);
    expect(r.totals.overtimeEmployees).toBe(expected ? 1 : 0);
  });

  it('overtime is summed across multiple shifts per employee', async () => {
    // two shifts of 1300 min each = 2600 > 2520 -> overtime
    const s1 = new Date('2026-06-01T06:00:00.000Z');
    const s2 = new Date('2026-06-03T06:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: s1, endAtUtc: new Date(s1.getTime() + 1300 * 60_000), assignments: [emp('e1', 35)] }),
      makeShift({ startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 1300 * 60_000), assignments: [emp('e1', 35)] }),
    ]);
    expect(r.perEmployee[0]!.isOvertime).toBe(true);
    expect(r.totals.overtimeEmployees).toBe(1);
  });
});

describe('fetchLaborCostForWeek — default-rate fallback for null/zero rate', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['0', 0],
    ['empty string', ''],
  ])('rate %s falls back to DEFAULT 35 ILS (3500 agorot)', async (_l, rate) => {
    // 60 min so cost == rate agorot. Default => 3500 agorot = 35 ILS.
    const r = await run([
      makeShift({
        startAtUtc: new Date('2026-06-01T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-01T09:00:00.000Z'),
        assignments: [emp('e1', rate)],
      }),
    ]);
    expect(r.totals.cost).toBe(35);
    expect(r.perEmployee[0]!.hourlyRate).toBeNull();
    expect(r.totals.employeesWithoutRate).toBe(1);
    expect(r.defaultHourlyRate).toBe(35);
  });

  it('Prisma.Decimal(0) (schema default) is treated as NOT configured -> 3500 fallback', async () => {
    // REGRESSION: hourlyRate Decimal @default(0) is a TRUTHY OBJECT. A naive
    // truthiness check bills ₪0 silently and never counts the employee. The
    // business rule says 0 means "not configured" -> default 3500 agorot.
    const r = await run([
      makeShift({
        startAtUtc: new Date('2026-06-01T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-01T09:00:00.000Z'), // 60 min => cost == rate
        assignments: [emp('e1', new Prisma.Decimal(0))],
      }),
    ]);
    expect(r.totals.cost).toBe(35); // 3500 agorot, NOT 0
    expect(r.perEmployee[0]!.hourlyRate).toBeNull();
    expect(r.totals.employeesWithoutRate).toBe(1);
  });

  it('positive Prisma.Decimal rate is honoured (not defaulted)', async () => {
    const r = await run([
      makeShift({
        startAtUtc: new Date('2026-06-01T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-01T09:00:00.000Z'), // 60 min
        assignments: [emp('e1', new Prisma.Decimal('42.50'))],
      }),
    ]);
    expect(r.totals.cost).toBe(42.5); // 4250 agorot
    expect(r.perEmployee[0]!.hourlyRate).toBe(42.5);
    expect(r.totals.employeesWithoutRate).toBe(0);
  });

  it.each([
    ['NaN', NaN],
    ['empty string', ''],
    ['non-numeric N/A', 'N/A'],
    ['negative -10', -10],
  ])('corrupt rate %s never poisons money math: totals stay finite & counted', async (_l, rate) => {
    const r = await run([
      makeShift({
        startAtUtc: new Date('2026-06-01T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-01T09:00:00.000Z'), // 60 min
        assignments: [emp('e1', rate)],
      }),
    ]);
    // No NaN/null can reach the aggregates — they must be finite numbers.
    expect(Number.isFinite(r.totals.cost)).toBe(true);
    expect(Number.isFinite(r.totals.hours)).toBe(true);
    expect(Number.isFinite(r.perEmployee[0]!.cost)).toBe(true);
    // Falls back to default 35 ILS and is counted as without-rate.
    expect(r.totals.cost).toBe(35);
    expect(r.perEmployee[0]!.hourlyRate).toBeNull();
    expect(r.totals.employeesWithoutRate).toBe(1);
  });

  it('mixed rated and unrated employees compute independently', async () => {
    const r = await run([
      makeShift({ assignments: [emp('rated', 50)] }), // 360@5000 = round(30000)=30000 -> 300 ILS
      makeShift({
        startAtUtc: new Date('2026-06-02T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-02T14:00:00.000Z'),
        assignments: [emp('norate', null)], // 360@3500 = 21000 -> 210 ILS
      }),
    ]);
    expect(Math.round(r.totals.cost * 100)).toBe(30000 + 21000);
    expect(r.totals.employeesWithoutRate).toBe(1);
    const rated = r.perEmployee.find((e) => e.employeeId === 'rated')!;
    const norate = r.perEmployee.find((e) => e.employeeId === 'norate')!;
    expect(rated.cost).toBe(300);
    expect(rated.hourlyRate).toBe(50);
    expect(norate.cost).toBe(210);
    expect(norate.hourlyRate).toBeNull();
  });
});

describe('fetchLaborCostForWeek — employeesWithoutRate dedup count', () => {
  it('counts each rate-less employee once across multiple shifts', async () => {
    const s2 = new Date('2026-06-02T08:00:00.000Z');
    const s3 = new Date('2026-06-03T08:00:00.000Z');
    const r = await run([
      makeShift({ assignments: [emp('x', null), emp('y', null)] }),
      makeShift({ startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 60 * 60_000), assignments: [emp('x', null)] }),
      makeShift({ startAtUtc: s3, endAtUtc: new Date(s3.getTime() + 60 * 60_000), assignments: [emp('z', 40)] }),
    ]);
    expect(r.totals.employeesWithoutRate).toBe(2); // x and y, not z, x not double-counted
  });

  it('is zero when everyone has a rate', async () => {
    const r = await run([makeShift({ assignments: [emp('a', 35), emp('b', 40)] })]);
    expect(r.totals.employeesWithoutRate).toBe(0);
  });
});

describe('fetchLaborCostForWeek — uncovered / openShifts math', () => {
  it('required=2 with 0 assignments -> 2 open, full duration counted twice as uncovered', async () => {
    const r = await run([
      makeShift({ requiredEmployeeCount: 2, assignments: [] }), // 360 min, 0 assigned
    ]);
    expect(r.totals.openShifts).toBe(2);
    // uncoveredMinutes = 360 * (2-0) = 720 -> 12 hours
    expect(r.totals.uncoveredHours).toBe(12);
    expect(r.totals.cost).toBe(0);
    expect(r.totals.employees).toBe(0);
  });

  it('required=3 with 1 assignment -> 2 open, uncovered=duration*2', async () => {
    const r = await run([
      makeShift({ requiredEmployeeCount: 3, assignments: [emp('e1', 35)] }), // 360 min
    ]);
    expect(r.totals.openShifts).toBe(2);
    expect(r.totals.uncoveredHours).toBe(12); // 360*2/60
    expect(r.totals.shifts).toBe(1);
  });

  it('fully covered shift -> 0 open, 0 uncovered', async () => {
    const r = await run([
      makeShift({ requiredEmployeeCount: 2, assignments: [emp('a', 35), emp('b', 35)] }),
    ]);
    expect(r.totals.openShifts).toBe(0);
    expect(r.totals.uncoveredHours).toBe(0);
  });

  it('over-staffed shift (3 assigned, 2 required) -> no negative open shifts', async () => {
    const r = await run([
      makeShift({
        requiredEmployeeCount: 2,
        assignments: [emp('a', 35), emp('b', 35), emp('c', 35)],
      }),
    ]);
    expect(r.totals.openShifts).toBe(0);
    expect(r.totals.uncoveredHours).toBe(0);
    expect(r.totals.employees).toBe(3);
  });

  it('null requiredEmployeeCount defaults to 1', async () => {
    const r = await run([makeShift({ requiredEmployeeCount: null, assignments: [] })]);
    expect(r.totals.openShifts).toBe(1);
    expect(r.totals.uncoveredHours).toBe(6); // 360 min
  });
});

describe('fetchLaborCostForWeek — assignment status filtering', () => {
  it('only CONFIRMED/COMPLETED/PROPOSED count; DECLINED/CANCELLED ignored', async () => {
    const r = await run([
      makeShift({
        requiredEmployeeCount: 4,
        assignments: [
          { assignmentStatus: 'CONFIRMED', employee: { id: 'c', fullName: 'C', hourlyRate: 35 } },
          { assignmentStatus: 'COMPLETED', employee: { id: 'd', fullName: 'D', hourlyRate: 35 } },
          { assignmentStatus: 'PROPOSED', employee: { id: 'p', fullName: 'P', hourlyRate: 35 } },
          { assignmentStatus: 'DECLINED', employee: { id: 'x', fullName: 'X', hourlyRate: 35 } },
          { assignmentStatus: 'CANCELLED', employee: { id: 'y', fullName: 'Y', hourlyRate: 35 } },
        ],
      }),
    ]);
    expect(r.totals.employees).toBe(3); // only c,d,p
    expect(r.totals.openShifts).toBe(1); // required 4 - 3 counted
  });
});

describe('fetchLaborCostForWeek — week window & cancelled filtering', () => {
  it('excludes shifts outside [weekStart, weekStart+7d) and CANCELLED', async () => {
    const r = await run([
      makeShift({ assignments: [emp('a', 35)] }), // in window
      makeShift({
        startAtUtc: new Date('2026-06-08T08:00:00.000Z'), // exactly +7d -> excluded (lt)
        endAtUtc: new Date('2026-06-08T14:00:00.000Z'),
        assignments: [emp('b', 35)],
      }),
      makeShift({
        startAtUtc: new Date('2026-05-31T08:00:00.000Z'), // before window
        endAtUtc: new Date('2026-05-31T14:00:00.000Z'),
        assignments: [emp('c', 35)],
      }),
      makeShift({ status: 'CANCELLED', assignments: [emp('d', 35)] }),
    ]);
    expect(r.totals.shifts).toBe(1);
    expect(r.totals.employees).toBe(1);
    expect(r.perEmployee[0]!.employeeId).toBe('a');
  });

  it('includes shift exactly at weekStart (gte boundary)', async () => {
    const r = await run([
      makeShift({
        startAtUtc: new Date('2026-06-01T00:00:00.000Z'),
        endAtUtc: new Date('2026-06-01T06:00:00.000Z'),
        assignments: [emp('a', 35)],
      }),
    ]);
    expect(r.totals.shifts).toBe(1);
  });
});

describe('fetchLaborCostForWeek — per-day / per-role / per-location aggregation', () => {
  it('aggregates by ISO day, sorted ascending; counts shifts per day', async () => {
    const day1a = new Date('2026-06-01T08:00:00.000Z');
    const day1b = new Date('2026-06-01T16:00:00.000Z');
    const day3 = new Date('2026-06-03T08:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: day1a, endAtUtc: new Date(day1a.getTime() + 360 * 60_000), assignments: [emp('a', 35)] }),
      makeShift({ startAtUtc: day1b, endAtUtc: new Date(day1b.getTime() + 360 * 60_000), assignments: [emp('b', 35)] }),
      makeShift({ startAtUtc: day3, endAtUtc: new Date(day3.getTime() + 360 * 60_000), assignments: [] }), // unassigned
    ]);
    expect(r.perDay.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-03']);
    const d1 = r.perDay.find((d) => d.date === '2026-06-01')!;
    expect(d1.shifts).toBe(2);
    expect(d1.hours).toBe(12); // two 6h shifts
    expect(d1.cost).toBe(2 * 210); // 360@3500 each
    const d3 = r.perDay.find((d) => d.date === '2026-06-03')!;
    expect(d3.shifts).toBe(1);
    expect(d3.hours).toBe(0); // no assignments
    expect(d3.cost).toBe(0);
  });

  it('aggregates by role name and falls back to "ללא תפקיד"', async () => {
    const s2 = new Date('2026-06-02T08:00:00.000Z');
    const r = await run([
      makeShift({ role: { name: 'מלצר' }, assignments: [emp('a', 35)] }),
      makeShift({ role: null, startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 360 * 60_000), assignments: [emp('b', 35)] }),
    ]);
    const names = r.perRole.map((x) => x.name).sort();
    expect(names).toEqual(['מלצר', 'ללא תפקיד'].sort());
    expect(r.perRole.find((x) => x.name === 'מלצר')!.cost).toBe(210);
    expect(r.perRole.find((x) => x.name === 'ללא תפקיד')!.cost).toBe(210);
  });

  it('aggregates by location name and falls back to "ללא סניף"', async () => {
    const s2 = new Date('2026-06-02T08:00:00.000Z');
    const r = await run([
      makeShift({ location: { name: 'צפון' }, assignments: [emp('a', 35)] }),
      makeShift({ location: null, startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 360 * 60_000), assignments: [emp('b', 40)] }),
    ]);
    expect(r.perLocation.find((x) => x.name === 'צפון')!.cost).toBe(210);
    expect(r.perLocation.find((x) => x.name === 'ללא סניף')!.cost).toBe(240); // 360@4000
  });

  it('day/role/location costs are internally consistent with totals', async () => {
    const shifts = [
      makeShift({ role: { name: 'A' }, location: { name: 'L1' }, assignments: [emp('a', 35.5)] }),
      makeShift({
        startAtUtc: new Date('2026-06-02T08:00:00.000Z'),
        endAtUtc: new Date('2026-06-02T13:00:00.000Z'),
        role: { name: 'B' },
        location: { name: 'L2' },
        assignments: [emp('b', 41.17)],
      }),
    ];
    const r = await run(shifts);
    const totalAg = Math.round(r.totals.cost * 100);
    expect(r.perRole.reduce((s, x) => s + Math.round(x.cost * 100), 0)).toBe(totalAg);
    expect(r.perLocation.reduce((s, x) => s + Math.round(x.cost * 100), 0)).toBe(totalAg);
    expect(r.perDay.reduce((s, x) => s + Math.round(x.cost * 100), 0)).toBe(totalAg);
  });
});

describe('fetchLaborCostForWeek — perEmployee sort & shape', () => {
  it('sorts perEmployee by cost descending', async () => {
    const s2 = new Date('2026-06-02T08:00:00.000Z');
    const s3 = new Date('2026-06-03T08:00:00.000Z');
    const r = await run([
      makeShift({ assignments: [emp('low', 30)] }), // 360@3000=18000 ->180
      makeShift({ startAtUtc: s2, endAtUtc: new Date(s2.getTime() + 360 * 60_000), assignments: [emp('high', 60)] }), // 360
      makeShift({ startAtUtc: s3, endAtUtc: new Date(s3.getTime() + 360 * 60_000), assignments: [emp('mid', 45)] }), // 270
    ]);
    expect(r.perEmployee.map((e) => e.employeeId)).toEqual(['high', 'mid', 'low']);
  });

  it('returns ILS/hours rounded only at output (hoursOf rounds to 2 places)', async () => {
    // 100 min -> 1.6666.. h -> round 1.67
    const start = new Date('2026-06-01T08:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: start, endAtUtc: new Date(start.getTime() + 100 * 60_000), assignments: [emp('e1', 35)] }),
    ]);
    expect(r.totals.hours).toBe(1.67);
    expect(r.perEmployee[0]!.hours).toBe(1.67);
    // cost = round(100*3500/60)=round(5833.33)=5833 agorot = 58.33 ILS
    expect(r.totals.cost).toBe(58.33);
  });
});

describe('fetchLaborCostForWeek — duration rounding (sub-minute)', () => {
  it('rounds duration to nearest minute (29 sec -> 0 added min)', async () => {
    // 90 min + 29 sec -> round(90.483 min)=90
    const start = new Date('2026-06-01T08:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: start, endAtUtc: new Date(start.getTime() + 90 * 60_000 + 29_000), assignments: [emp('e1', 60)] }),
    ]);
    // 90 min @ 6000 = round(9000)=9000 -> 90 ILS
    expect(r.totals.cost).toBe(90);
  });

  it('rounds duration up at 30 sec (90 min 30s -> 91 min)', async () => {
    const start = new Date('2026-06-01T08:00:00.000Z');
    const r = await run([
      makeShift({ startAtUtc: start, endAtUtc: new Date(start.getTime() + 90 * 60_000 + 30_000), assignments: [emp('e1', 60)] }),
    ]);
    // 91 min @ 6000 = round(9100)=9100 -> 91 ILS
    expect(r.totals.cost).toBe(91);
  });
});

describe('fetchLaborCostForWeek — P2022 degraded mode', () => {
  it('falls back to default rate for everyone when hourlyRate column missing', async () => {
    // includeRate query throws P2022 -> retry without rate -> all default 35.
    const r = await run(
      [
        makeShift({ assignments: [emp('a', 50)] }), // rate ignored in degraded mode
        makeShift({
          startAtUtc: new Date('2026-06-02T08:00:00.000Z'),
          endAtUtc: new Date('2026-06-02T14:00:00.000Z'),
          assignments: [emp('b', 99)],
        }),
      ],
      { throwP2022: true },
    );
    // both 360 min @ default 3500 = 21000 each -> 420 ILS
    expect(Math.round(r.totals.cost * 100)).toBe(42000);
    expect(r.perEmployee.every((e) => e.hourlyRate === null)).toBe(true);
    expect(r.totals.employeesWithoutRate).toBe(2);
  });

  it('rethrows non-P2022 errors', async () => {
    await expect(run([makeShift()], { throwOther: true })).rejects.toThrow('boom');
  });
});

describe('fetchLaborCostForWeek — empty & metadata', () => {
  it('returns zeroed totals for empty week', async () => {
    const r = await run([]);
    expect(r.totals).toMatchObject({
      hours: 0,
      cost: 0,
      shifts: 0,
      uncoveredHours: 0,
      openShifts: 0,
      employees: 0,
      overtimeEmployees: 0,
      employeesWithoutRate: 0,
    });
    expect(r.perEmployee).toEqual([]);
    expect(r.perDay).toEqual([]);
  });

  it('exposes currency, weekStart ISO and defaultHourlyRate', async () => {
    const r = await run([]);
    expect(r.currency).toBe('ILS');
    expect(r.weekStart).toBe(WEEK_START.toISOString());
    expect(r.defaultHourlyRate).toBe(35);
  });

  it('queries the fake db with the correct org and week window', async () => {
    const db = fakeDb([makeShift({ assignments: [emp('a', 35)] })]);
    const r = await fetchLaborCostForWeek({ organizationId: ORG, weekStart: WEEK_START }, db);
    expect(r.totals.shifts).toBe(1);
    expect(db._calls()).toBe(1);
  });
});
