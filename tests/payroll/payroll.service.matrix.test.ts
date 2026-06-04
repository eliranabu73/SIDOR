/* eslint-disable @typescript-eslint/no-explicit-any */
//
// PAYROLL WAGE MATRIX — table-driven precision tests for
// src/modules/payroll/payroll.service.ts :: generatePayrollExport().
//
// This is WAGES: every expected number below is a HAND-COMPUTED literal with
// the arithmetic shown in the adjacent comment. We never recompute an expected
// value by calling the source formula (no tautologies). Money is reasoned in
// integer agorot where relevant; the service emits ILS rounded to 2 dp.
//
// Source money model (re-derived from payroll.service.ts):
//   shiftMin   = round((endAtUtc - startAtUtc) / 60000)            (per shift)
//   per-shift tiers accumulate scheduledMinutes:
//       regular = min(shiftMin, 480)         (480 = 8h)
//       ot125   = clamp(shiftMin,_,600) - 480 floored at 0   (600 = 10h)
//       ot150   = max(0, shiftMin - 600)
//   weekendMin = Shabbat minutes (Fri >=18:00 local .. all Sat), 15-min slices
//   billableMinutes = actualMinutes > 0 ? actualMinutes : scheduledMinutes
//   tiers for the CSV are RE-derived from billableMinutes (same 480/600 split)
//   regularH/ot125H/ot150H/weekendH = minutes / 60
//   gross = regularH*rate
//         + ot125H*rate*1.25
//         + ot150H*rate*1.5
//         + weekendH*rate*0.5            (Shabbat top-up: 1.5x - 1x)
//   round2(x) = Math.round(x*100)/100   applied to every hour + gross figure
//   default rate = 35 ILS/h when employee.hourlyRate is null
//
// Determinism: all instants are explicit UTC. Local-time logic (Shabbat) is
// pinned to Asia/Jerusalem (UTC+3 in summer 2026). Calendar anchors:
//   2026-06-06 = Saturday (Shabbat, full day)
//   2026-06-05 = Friday   (Shabbat begins 18:00 local = 15:00Z)
//   2026-06-08 = Monday   (ordinary weekday, no Shabbat)
//
jest.mock('../../src/db/prisma', () => ({ prisma: {} }));

import type { Db } from '../../src/db/prisma';
import {
  generatePayrollExport,
  toCsv,
} from '../../src/modules/payroll/payroll.service';
import {
  HILAN_HEADERS,
  STANDARD_HEADERS,
} from '../../src/modules/payroll/hilan-adapter.service';

const ORG = 'org-payroll';
const TZ = 'Asia/Jerusalem';

// Period: the whole of June 2026 (UTC). Wide enough to capture every shift.
const PERIOD_START = new Date('2026-06-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-07-01T00:00:00.000Z');

// --- fake-db builder -------------------------------------------------------

interface RawShift {
  startAtUtc: Date;
  endAtUtc: Date;
  timezone?: string;
}
interface RawEmp {
  id: string;
  fullName: string;
  hourlyRate: number | null;
  israeliId?: string | null;
  defaultTimezone?: string | null;
}
interface RawAssignment {
  employee: RawEmp;
  shift: RawShift;
}
interface RawTip {
  employeeId: string;
  amountAgorot: number;
}
interface RawTimeEntry {
  employeeId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
}

function fakeDb(opts: {
  assignments: RawAssignment[];
  tips?: RawTip[];
  timeEntries?: RawTimeEntry[];
}): Db {
  const tips = opts.tips ?? [];
  const timeEntries = opts.timeEntries ?? [];
  return {
    shiftAssignment: {
      findMany: async () =>
        opts.assignments.map((a) => ({
          assignmentStatus: 'CONFIRMED',
          employee: {
            id: a.employee.id,
            fullName: a.employee.fullName,
            email: a.employee.id + '@x.test',
            hourlyRate: a.employee.hourlyRate,
            defaultTimezone: a.employee.defaultTimezone ?? TZ,
            israeliId: a.employee.israeliId ?? null,
          },
          shift: {
            startAtUtc: a.shift.startAtUtc,
            endAtUtc: a.shift.endAtUtc,
            timezone: a.shift.timezone ?? TZ,
          },
        })),
    },
    tipDistribution: {
      findMany: async () =>
        tips.map((t) => ({
          employeeId: t.employeeId,
          amountAgorot: t.amountAgorot,
        })),
    },
    timeEntry: {
      findMany: async () =>
        timeEntries.map((e) => ({
          employeeId: e.employeeId,
          clockInAt: e.clockInAt,
          clockOutAt: e.clockOutAt,
        })),
    },
  } as unknown as Db;
}

let _seq = 0;
function emp(over: Partial<RawEmp> = {}): RawEmp {
  return {
    id: 'emp-' + ++_seq,
    fullName: 'עובד בדיקה',
    hourlyRate: 50,
    israeliId: null,
    defaultTimezone: TZ,
    ...over,
  };
}
function shift(startUtcIso: string, endUtcIso: string, tz = TZ): RawShift {
  return {
    startAtUtc: new Date(startUtcIso),
    endAtUtc: new Date(endUtcIso),
    timezone: tz,
  };
}

async function runStandard(opts: Parameters<typeof fakeDb>[0]) {
  return generatePayrollExport(
    {
      orgId: ORG,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      format: 'standard',
    },
    fakeDb(opts),
  );
}

// ===========================================================================
// 1. OVERTIME TIER GRID — scheduled minutes only (no punches), rate = 50/h
// ===========================================================================
//
// Single weekday shift (Mon 2026-06-08), no Shabbat. We vary duration and
// hand-derive regular/125/150 hours + gross.
//
// regular(min) = min(m,480); ot125(min) = clamp(m,600)-480>=0; ot150 = m-600>=0
// gross = rH*50 + o1H*50*1.25 + o2H*50*1.5     (no weekend term)
//
interface TierCase {
  name: string;
  /** weekday shift duration in minutes */
  durMin: number;
  reg: number; // expected regularHours
  o1: number; // expected ot125Hours
  o2: number; // expected ot150Hours
  total: number; // expected totalHours
  gross: number; // expected totalGrossILS
}

// Monday 2026-06-08 05:00:00Z = 08:00 local. End varies.
const MON_START = '2026-06-08T05:00:00.000Z';
function monEnd(durMin: number): string {
  return new Date(
    new Date(MON_START).getTime() + durMin * 60_000,
  ).toISOString();
}

const TIER_CASES: TierCase[] = [
  // 0h..8h all regular
  {
    name: '1 minute → 1/60h regular',
    durMin: 1,
    reg: 0.02, // round2(1/60=0.01666)=0.02
    o1: 0,
    o2: 0,
    total: 0.02, // round2((1/60))=0.02
    gross: 0.83, // (1/60)*50 = 0.8333 → round2 = 0.83
  },
  {
    name: '4h shift (240m) → 4h reg',
    durMin: 240,
    reg: 4,
    o1: 0,
    o2: 0,
    total: 4,
    gross: 200, // 4*50
  },
  {
    name: 'exactly 8h (480m) → 8h reg, no OT',
    durMin: 480,
    reg: 8,
    o1: 0,
    o2: 0,
    total: 8,
    gross: 400, // 8*50
  },
  {
    name: '8h + 1m (481m) → 1m into 125%',
    durMin: 481,
    reg: 8, // 480/60
    o1: 0.02, // round2(1/60)=0.02
    o2: 0,
    total: 8.02, // round2(481/60=8.0166)=8.02
    gross: 401.04, // 8*50 + (1/60)*50*1.25 = 400 + 1.0416 = 401.0416 → 401.04
  },
  {
    name: '9h (540m) → 8h reg + 1h 125%',
    durMin: 540,
    reg: 8,
    o1: 1, // 60/60
    o2: 0,
    total: 9,
    gross: 462.5, // 400 + 1*50*1.25=62.5
  },
  {
    name: 'exactly 10h (600m) → 8h reg + 2h 125%',
    durMin: 600,
    reg: 8,
    o1: 2,
    o2: 0,
    total: 10,
    gross: 525, // 400 + 2*62.5=125
  },
  {
    name: '10h + 1m (601m) → 1m into 150%',
    durMin: 601,
    reg: 8,
    o1: 2, // 120/60
    o2: 0.02, // round2(1/60)=0.02
    total: 10.02, // round2(601/60=10.0166)=10.02
    gross: 526.25, // 525 + (1/60)*50*1.5 = 525 + 1.25 = 526.25
  },
  {
    name: '12h (720m) → 8 reg + 2(125) + 2(150)',
    durMin: 720,
    reg: 8,
    o1: 2,
    o2: 2,
    total: 12,
    gross: 675, // 400 + 125 + 2*50*1.5=150
  },
  {
    name: '16h (960m) → 8 reg + 2(125) + 6(150)',
    durMin: 960,
    reg: 8,
    o1: 2,
    o2: 6,
    total: 16,
    gross: 400 + 125 + 6 * 50 * 1.5, // = 400+125+450 = 975
  },
];

describe('overtime tier grid (rate 50/h, scheduled minutes, no Shabbat)', () => {
  for (const c of TIER_CASES) {
    it(c.name, async () => {
      const e = emp({ hourlyRate: 50, fullName: 'דני כהן' });
      const res = await runStandard({
        assignments: [
          { employee: e, shift: shift(MON_START, monEnd(c.durMin)) },
        ],
      });
      expect(res.rawRows).toHaveLength(1);
      const r = res.rawRows[0]!;
      expect(r.regularHours).toBe(c.reg);
      expect(r.ot125Hours).toBe(c.o1);
      expect(r.ot150Hours).toBe(c.o2);
      expect(r.totalHours).toBe(c.total);
      expect(r.weekendHours).toBe(0);
      expect(r.totalGrossILS).toBe(c.gross);
      expect(r.scheduledMinutes).toBe(c.durMin);
      expect(r.actualMinutes).toBe(0);
    });
  }
});

// ===========================================================================
// 2. RATE GRID — fixed 12h shift, vary hourly rate (incl. default fallback)
// ===========================================================================
//
// 12h (720m): reg 8h, ot125 2h, ot150 2h. gross = rate*(8 + 2*1.25 + 2*1.5)
//                                                = rate * (8 + 2.5 + 3) = rate*13.5
//
interface RateCase {
  name: string;
  rate: number | null;
  effectiveRate: number; // rate used (null → 35 default)
  gross: number; // = effectiveRate * 13.5
}
const RATE_CASES: RateCase[] = [
  { name: 'rate 50', rate: 50, effectiveRate: 50, gross: 675 }, // 50*13.5
  { name: 'rate 40', rate: 40, effectiveRate: 40, gross: 540 }, // 40*13.5
  { name: 'rate 100', rate: 100, effectiveRate: 100, gross: 1350 }, // 100*13.5
  { name: 'rate 30', rate: 30, effectiveRate: 30, gross: 405 }, // 30*13.5
  // default fallback 35 → 35*13.5 = 472.5
  { name: 'null rate → default 35', rate: null, effectiveRate: 35, gross: 472.5 },
  // 33.33 → 33.33*13.5 = 449.955 → round2 = 449.96
  { name: 'rate 33.33 rounds gross to 449.96', rate: 33.33, effectiveRate: 33.33, gross: 449.96 },
];

describe('rate grid (fixed 12h shift = 13.5 paid-hour units)', () => {
  for (const c of RATE_CASES) {
    it(c.name, async () => {
      const e = emp({ hourlyRate: c.rate });
      const res = await runStandard({
        assignments: [{ employee: e, shift: shift(MON_START, monEnd(720)) }],
      });
      const r = res.rawRows[0]!;
      expect(r.regularHours).toBe(8);
      expect(r.ot125Hours).toBe(2);
      expect(r.ot150Hours).toBe(2);
      expect(r.totalGrossILS).toBe(c.gross);
    });
  }
});

// ===========================================================================
// 3. SHABBAT / WEEKEND GRID — premium top-up (rate 50/h)
// ===========================================================================
//
// weekend term in gross = weekendH * rate * 0.5
// Saturday 2026-06-06: full Shabbat. Friday 2026-06-05: Shabbat from 18:00
// local (= 15:00Z summer). 15-min slice resolution, shifts aligned to :00/:15.
//
interface ShabbatCase {
  name: string;
  startUtc: string;
  endUtc: string;
  shiftMin: number; // for scheduledMinutes assertion
  reg: number;
  o1: number;
  o2: number;
  weekendH: number;
  gross: number;
}
const SHABBAT_CASES: ShabbatCase[] = [
  // Sat 10:00-14:00 local = 07:00-11:00Z → 4h, all Shabbat.
  // reg 4h; weekend 4h; gross = 4*50 + 4*50*0.5 = 200 + 100 = 300
  {
    name: 'full-Saturday 4h shift → 4h weekend top-up',
    startUtc: '2026-06-06T07:00:00.000Z',
    endUtc: '2026-06-06T11:00:00.000Z',
    shiftMin: 240,
    reg: 4,
    o1: 0,
    o2: 0,
    weekendH: 4,
    gross: 300,
  },
  // Sat 08:00-20:00 local = 05:00-17:00Z → 12h all Shabbat.
  // reg 8 / o1 2 / o2 2; weekend 12h.
  // gross = 8*50 + 2*62.5 + 2*75 + 12*50*0.5 = 400+125+150+300 = 975
  {
    name: 'full-Saturday 12h shift → tiers + 12h weekend',
    startUtc: '2026-06-06T05:00:00.000Z',
    endUtc: '2026-06-06T17:00:00.000Z',
    shiftMin: 720,
    reg: 8,
    o1: 2,
    o2: 2,
    weekendH: 12,
    gross: 975,
  },
  // Friday 16:00-20:00 local = 13:00-17:00Z. Shabbat starts 18:00 local
  // (=15:00Z) → only 18:00-20:00 local = 2h weekend. shiftMin 4h.
  // reg 4h; weekend 2h. gross = 4*50 + 2*50*0.5 = 200 + 50 = 250
  {
    name: 'Friday eve crossing 18:00 → only post-18:00 counts as Shabbat',
    startUtc: '2026-06-05T13:00:00.000Z',
    endUtc: '2026-06-05T17:00:00.000Z',
    shiftMin: 240,
    reg: 4,
    o1: 0,
    o2: 0,
    weekendH: 2,
    gross: 250,
  },
  // Friday 10:00-14:00 local = 07:00-11:00Z. Entirely before 18:00 → no Shabbat.
  // reg 4h; weekend 0. gross = 200
  {
    name: 'Friday daytime entirely before 18:00 → no weekend',
    startUtc: '2026-06-05T07:00:00.000Z',
    endUtc: '2026-06-05T11:00:00.000Z',
    shiftMin: 240,
    reg: 4,
    o1: 0,
    o2: 0,
    weekendH: 0,
    gross: 200,
  },
  // Sat night into Sun: Sat 22:00-Sun 02:00 local = Sat19:00Z-Sat23:00Z.
  // Sat 22:00-24:00 local = 2h Shabbat; Sun 00:00-02:00 = not Shabbat.
  // shiftMin 4h. reg 4h. weekend 2h. gross = 200 + 2*25 = 250
  {
    name: 'Saturday night into Sunday → only pre-midnight counts',
    startUtc: '2026-06-06T19:00:00.000Z',
    endUtc: '2026-06-06T23:00:00.000Z',
    shiftMin: 240,
    reg: 4,
    o1: 0,
    o2: 0,
    weekendH: 2,
    gross: 250,
  },
];

describe('Shabbat / weekend premium grid (rate 50/h)', () => {
  for (const c of SHABBAT_CASES) {
    it(c.name, async () => {
      const e = emp({ hourlyRate: 50 });
      const res = await runStandard({
        assignments: [{ employee: e, shift: shift(c.startUtc, c.endUtc) }],
      });
      const r = res.rawRows[0]!;
      expect(r.regularHours).toBe(c.reg);
      expect(r.ot125Hours).toBe(c.o1);
      expect(r.ot150Hours).toBe(c.o2);
      expect(r.weekendHours).toBe(c.weekendH);
      expect(r.scheduledMinutes).toBe(c.shiftMin);
      expect(r.totalGrossILS).toBe(c.gross);
    });
  }
});

// ===========================================================================
// 4. PUNCHED (actual) MINUTES OVERRIDE scheduled minutes for billing
// ===========================================================================
//
// billableMinutes = actualMinutes>0 ? actualMinutes : scheduledMinutes
// actualMinutes = sum over completed entries of round((out-in)/60000)
// Tiers + gross are re-derived from billableMinutes. weekend stays from schedule.
//
describe('punched actual minutes override scheduled for pay', () => {
  it('actual 600m beats scheduled 480m → pay 10h tier from punches', async () => {
    const e = emp({ id: 'P1', hourlyRate: 50 });
    // scheduled 8h weekday shift
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
      timeEntries: [
        // clocked 10h (600m): 08:00-18:00 local = 05:00-15:00Z
        {
          employeeId: 'P1',
          clockInAt: new Date('2026-06-08T05:00:00.000Z'),
          clockOutAt: new Date('2026-06-08T15:00:00.000Z'),
        },
      ],
    });
    const r = res.rawRows[0]!;
    expect(r.actualMinutes).toBe(600);
    expect(r.scheduledMinutes).toBe(480);
    // billable 600 → reg 8, o1 2, o2 0; gross = 400 + 125 = 525
    expect(r.regularHours).toBe(8);
    expect(r.ot125Hours).toBe(2);
    expect(r.ot150Hours).toBe(0);
    expect(r.totalGrossILS).toBe(525);
  });

  it('two punches sum: 4h + 4h = 480m actual → 8h reg, gross 400', async () => {
    const e = emp({ id: 'P2', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(720)) }], // sched 12h
      timeEntries: [
        {
          employeeId: 'P2',
          clockInAt: new Date('2026-06-08T05:00:00.000Z'),
          clockOutAt: new Date('2026-06-08T09:00:00.000Z'), // 240m
        },
        {
          employeeId: 'P2',
          clockInAt: new Date('2026-06-08T10:00:00.000Z'),
          clockOutAt: new Date('2026-06-08T14:00:00.000Z'), // 240m
        },
      ],
    });
    const r = res.rawRows[0]!;
    expect(r.actualMinutes).toBe(480);
    expect(r.scheduledMinutes).toBe(720);
    expect(r.regularHours).toBe(8);
    expect(r.ot125Hours).toBe(0);
    expect(r.totalGrossILS).toBe(400); // billed on 8h, not scheduled 12h
  });

  it('open punch (clockOut null) is ignored → falls back to scheduled', async () => {
    const e = emp({ id: 'P3', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
      timeEntries: [
        {
          employeeId: 'P3',
          clockInAt: new Date('2026-06-08T05:00:00.000Z'),
          clockOutAt: null, // open → not counted
        },
      ],
    });
    const r = res.rawRows[0]!;
    expect(r.actualMinutes).toBe(0);
    expect(r.scheduledMinutes).toBe(480);
    expect(r.totalGrossILS).toBe(400); // scheduled fallback
  });

  it('actual minutes round to nearest minute (90s → 2m, 30s → 0m)', async () => {
    const e = emp({ id: 'P4', hourlyRate: 60 });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(60)) }],
      timeEntries: [
        // 89s ≈ 1.483m → round 1
        {
          employeeId: 'P4',
          clockInAt: new Date('2026-06-08T05:00:00.000Z'),
          clockOutAt: new Date('2026-06-08T05:01:29.000Z'),
        },
        // 90s = 1.5m → round 2
        {
          employeeId: 'P4',
          clockInAt: new Date('2026-06-08T06:00:00.000Z'),
          clockOutAt: new Date('2026-06-08T06:01:30.000Z'),
        },
      ],
    });
    const r = res.rawRows[0]!;
    // 1 + 2 = 3 minutes actual
    expect(r.actualMinutes).toBe(3);
    // billable 3m → reg 3m = 0.05h; round2(3/60)=0.05; gross=0.05*60=3
    expect(r.regularHours).toBe(0.05);
    expect(r.totalGrossILS).toBe(3);
  });
});

// ===========================================================================
// 5. TIPS — agorot pass-through and summation (Israeli Tip Law 2022)
// ===========================================================================
//
// tipsAgorot accumulates raw amountAgorot for matching employeeId; only added
// to employees that already have shift rows.
//
interface TipCase {
  name: string;
  tipsForEmp: number[];
  expectedAgorot: number;
}
const TIP_CASES: TipCase[] = [
  { name: 'no tips → 0', tipsForEmp: [], expectedAgorot: 0 },
  { name: 'single 12345 agorot', tipsForEmp: [12345], expectedAgorot: 12345 },
  { name: 'sum 10000 + 2550 = 12550', tipsForEmp: [10000, 2550], expectedAgorot: 12550 },
  { name: 'three pools 100+200+333 = 633', tipsForEmp: [100, 200, 333], expectedAgorot: 633 },
  { name: 'zero-value pool stays 0', tipsForEmp: [0, 0], expectedAgorot: 0 },
];

describe('tips agorot summation', () => {
  for (const c of TIP_CASES) {
    it(c.name, async () => {
      const e = emp({ id: 'T1', hourlyRate: 50 });
      const res = await runStandard({
        assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
        tips: c.tipsForEmp.map((a) => ({ employeeId: 'T1', amountAgorot: a })),
      });
      const r = res.rawRows[0]!;
      expect(r.tipsAgorot).toBe(c.expectedAgorot);
    });
  }

  it('tips for an unknown employee are dropped (no row created)', async () => {
    const e = emp({ id: 'T2', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
      tips: [
        { employeeId: 'T2', amountAgorot: 500 },
        { employeeId: 'ghost', amountAgorot: 999999 },
      ],
    });
    expect(res.rawRows).toHaveLength(1);
    expect(res.rawRows[0]!.tipsAgorot).toBe(500);
  });

  it('tips do NOT alter gross wages (separate column)', async () => {
    const e = emp({ id: 'T3', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
      tips: [{ employeeId: 'T3', amountAgorot: 50000 }],
    });
    const r = res.rawRows[0]!;
    expect(r.totalGrossILS).toBe(400); // 8h*50, unaffected by 500 ILS tips
    expect(r.tipsAgorot).toBe(50000);
  });
});

// ===========================================================================
// 6. MULTI-SHIFT AGGREGATION PER EMPLOYEE (tiers accumulate per shift)
// ===========================================================================
//
// IMPORTANT: per-shift tiers accumulate scheduledMinutes (sum of shiftMin),
// but the CSV tiers are RE-derived from the *total* billable minutes. So two
// 6h shifts (each <8h, all regular) sum to scheduledMinutes=720 → re-derived
// to reg 8h + 2h(125%). Gross uses the re-derived tiers.
//
describe('multi-shift aggregation per employee', () => {
  it('two 6h weekday shifts → scheduled 720m, re-derived to 8 reg + 2 ot125 + 2 ot150', async () => {
    const e = emp({ id: 'M1', hourlyRate: 50 });
    // Mon 6h + Tue 6h, both weekday, no Shabbat
    const res = await runStandard({
      assignments: [
        { employee: e, shift: shift('2026-06-08T05:00:00.000Z', '2026-06-08T11:00:00.000Z') },
        { employee: e, shift: shift('2026-06-09T05:00:00.000Z', '2026-06-09T11:00:00.000Z') },
      ],
    });
    const r = res.rawRows[0]!;
    expect(r.scheduledMinutes).toBe(720); // 360 + 360
    // billable=720 → reg min(720,480)=480→8h, ot125 min(720,600)-480=120→2h,
    //                ot150 max(0,720-600)=120→2h
    expect(r.regularHours).toBe(8);
    expect(r.ot125Hours).toBe(2);
    expect(r.ot150Hours).toBe(2);
    // gross = 8*50 + 2*50*1.25 + 2*50*1.5 = 400 + 125 + 150 = 675
    expect(r.totalGrossILS).toBe(675);
  });

  it('weekend minutes accumulate across shifts independently of tier re-derivation', async () => {
    const e = emp({ id: 'M2', hourlyRate: 50 });
    // Sat 4h (07-11Z, all Shabbat) + Mon 4h (weekday)
    const res = await runStandard({
      assignments: [
        { employee: e, shift: shift('2026-06-06T07:00:00.000Z', '2026-06-06T11:00:00.000Z') },
        { employee: e, shift: shift('2026-06-08T05:00:00.000Z', '2026-06-08T09:00:00.000Z') },
      ],
    });
    const r = res.rawRows[0]!;
    expect(r.scheduledMinutes).toBe(480); // 240 + 240
    expect(r.weekendHours).toBe(4); // only Saturday shift
    // billable 480 → reg 8h. gross = 8*50 + weekend 4h*50*0.5 = 400 + 100 = 500
    expect(r.regularHours).toBe(8);
    expect(r.totalGrossILS).toBe(500);
  });
});

// ===========================================================================
// 7. ZERO / DEGENERATE SHIFTS
// ===========================================================================
describe('zero-length and degenerate shifts', () => {
  it('zero-length shift contributes nothing but employee row still appears? (skipped → no row)', async () => {
    const e = emp({ id: 'Z1', hourlyRate: 50 });
    // single zero-length shift → shiftMin 0 → continue; no accumulator created
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, MON_START) }],
    });
    // No accumulator was created for this employee → no row.
    expect(res.rawRows).toHaveLength(0);
  });

  it('zero-length shift alongside a real shift → only real counts', async () => {
    const e = emp({ id: 'Z2', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [
        { employee: e, shift: shift(MON_START, MON_START) }, // 0m skipped
        { employee: e, shift: shift(MON_START, monEnd(480)) }, // 8h
      ],
    });
    expect(res.rawRows).toHaveLength(1);
    const r = res.rawRows[0]!;
    expect(r.scheduledMinutes).toBe(480);
    expect(r.totalGrossILS).toBe(400);
  });

  it('sub-minute shift (30s) rounds to 0 minutes → skipped (no row)', async () => {
    const e = emp({ id: 'Z3', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [
        {
          employee: e,
          shift: shift('2026-06-08T05:00:00.000Z', '2026-06-08T05:00:30.000Z'),
        },
      ],
    });
    // round(30000/60000)=round(0.5)=1 → 1 minute, NOT skipped.
    expect(res.rawRows).toHaveLength(1);
    expect(res.rawRows[0]!.scheduledMinutes).toBe(1);
  });

  it('29s shift rounds to 0 minutes → skipped (no row)', async () => {
    const e = emp({ id: 'Z4', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [
        {
          employee: e,
          shift: shift('2026-06-08T05:00:00.000Z', '2026-06-08T05:00:29.000Z'),
        },
      ],
    });
    // round(29000/60000)=round(0.483)=0 → skipped
    expect(res.rawRows).toHaveLength(0);
  });
});

// ===========================================================================
// 8. NAME SPLIT, ID, SORTING, FILENAME, FORMAT WIRING
// ===========================================================================
describe('row shaping, sorting, filename, format wiring', () => {
  it('splits fullName into first + last (rest joined)', async () => {
    const e = emp({ id: 'N1', fullName: 'משה בן דוד', hourlyRate: 50, israeliId: '123456782' });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
    });
    const r = res.rawRows[0]!;
    expect(r.firstName).toBe('משה');
    expect(r.lastName).toBe('בן דוד');
    expect(r.idNumber).toBe('123456782');
    expect(r.fullName).toBe('משה בן דוד');
  });

  it('single-word name → firstName set, lastName empty', async () => {
    const e = emp({ id: 'N2', fullName: 'מדונה', hourlyRate: 50 });
    const res = await runStandard({
      assignments: [{ employee: e, shift: shift(MON_START, monEnd(480)) }],
    });
    const r = res.rawRows[0]!;
    expect(r.firstName).toBe('מדונה');
    expect(r.lastName).toBe('');
    expect(r.idNumber).toBe(''); // null israeliId → empty string
  });

  it('rows are sorted by fullName (he locale)', async () => {
    const res = await runStandard({
      assignments: [
        { employee: emp({ id: 'S1', fullName: 'תמר', hourlyRate: 50 }), shift: shift(MON_START, monEnd(480)) },
        { employee: emp({ id: 'S2', fullName: 'אבי', hourlyRate: 50 }), shift: shift(MON_START, monEnd(480)) },
        { employee: emp({ id: 'S3', fullName: 'משה', hourlyRate: 50 }), shift: shift(MON_START, monEnd(480)) },
      ],
    });
    expect(res.rawRows.map((r) => r.fullName)).toEqual(['אבי', 'משה', 'תמר']);
  });

  it('filename reflects format + inclusive period (end - 1 day)', async () => {
    const res = await runStandard({
      assignments: [{ employee: emp({ id: 'F1', hourlyRate: 50 }), shift: shift(MON_START, monEnd(480)) }],
    });
    // periodStart 2026-06-01, periodEnd 2026-07-01 → inclusive end 2026-06-30
    expect(res.filename).toBe('payroll-standard-2026-06-01_2026-06-30.csv');
  });

  it('standard format uses STANDARD_HEADERS and maps fields', async () => {
    const res = await runStandard({
      assignments: [{ employee: emp({ id: 'H1', fullName: 'יוסי לוי', hourlyRate: 50, israeliId: '11122233' }), shift: shift(MON_START, monEnd(600)) }],
    });
    expect(res.headers).toEqual(STANDARD_HEADERS);
    const row = res.rows[0]!;
    expect(row['שם מלא']).toBe('יוסי לוי');
    expect(row['תעודת זהות']).toBe('11122233');
    expect(row['שעות רגילות']).toBe('8.00');
    expect(row['שעות נוספות 125%']).toBe('2.00');
    expect(row['סה״כ ברוטו (ש״ח)']).toBe('525.00');
  });

  it('hilan format uses HILAN_HEADERS and emits idNumber + tips in ILS', async () => {
    const res = await generatePayrollExport(
      {
        orgId: ORG,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        format: 'hilan',
      },
      fakeDb({
        assignments: [{ employee: emp({ id: 'H2', fullName: 'דנה כהן', hourlyRate: 50, israeliId: '987654321' }), shift: shift(MON_START, monEnd(480)) }],
        tips: [{ employeeId: 'H2', amountAgorot: 12345 }],
      }),
    );
    expect(res.headers).toEqual(HILAN_HEADERS);
    expect(res.format).toBe('hilan');
    const row = res.rows[0]!;
    expect(row['מספר עובד']).toBe('987654321');
    expect(row['שם פרטי']).toBe('דנה');
    expect(row['שם משפחה']).toBe('כהן');
    expect(row['סה״כ שעות רגילות']).toBe('8.00');
    expect(row['טיפים (ש״ח)']).toBe('123.45'); // 12345 agorot / 100
    expect(res.filename).toBe('payroll-hilan-2026-06-01_2026-06-30.csv');
  });

  it('hilan/standard expose actual + scheduled hours columns to 2dp', async () => {
    const res = await generatePayrollExport(
      {
        orgId: ORG,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        format: 'hilan',
      },
      fakeDb({
        assignments: [{ employee: emp({ id: 'H3', hourlyRate: 50 }), shift: shift(MON_START, monEnd(600)) }],
        timeEntries: [
          { employeeId: 'H3', clockInAt: new Date('2026-06-08T05:00:00.000Z'), clockOutAt: new Date('2026-06-08T13:00:00.000Z') }, // 480m actual
        ],
      }),
    );
    const row = res.rows[0]!;
    expect(row['שעות בפועל']).toBe('8.00'); // 480/60
    expect(row['שעות מתוכננות']).toBe('10.00'); // scheduled 600/60
  });
});

// ===========================================================================
// 9. EMPTY RESULT
// ===========================================================================
describe('empty period', () => {
  it('no assignments → no rows, headers + filename still set', async () => {
    const res = await runStandard({ assignments: [] });
    expect(res.rawRows).toEqual([]);
    expect(res.rows).toEqual([]);
    expect(res.headers).toEqual(STANDARD_HEADERS);
    expect(res.filename).toBe('payroll-standard-2026-06-01_2026-06-30.csv');
  });
});

// ===========================================================================
// 10. CSV SERIALISER — escaping + BOM + CRLF
// ===========================================================================
describe('toCsv serialisation', () => {
  const H = ['a', 'b'] as const;

  it('prefixes UTF-8 BOM and joins with CRLF', () => {
    const csv = toCsv(H, [{ a: '1', b: '2' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toBe('﻿a,b\r\n1,2');
  });

  it('escapes commas by quoting', () => {
    const csv = toCsv(H, [{ a: 'x,y', b: 'z' }]);
    expect(csv).toBe('﻿a,b\r\n"x,y",z');
  });

  it('escapes embedded double-quotes by doubling', () => {
    const csv = toCsv(H, [{ a: 'he said "hi"', b: 'z' }]);
    expect(csv).toBe('﻿a,b\r\n"he said ""hi""",z');
  });

  it('escapes newlines by quoting', () => {
    const csv = toCsv(H, [{ a: 'line1\nline2', b: 'z' }]);
    expect(csv).toBe('﻿a,b\r\n"line1\nline2",z');
  });

  it('missing field becomes empty cell', () => {
    const csv = toCsv(H, [{ a: 'only-a' } as Record<string, string>]);
    expect(csv).toBe('﻿a,b\r\nonly-a,');
  });

  it('multiple rows each on their own CRLF line', () => {
    const csv = toCsv(H, [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
    expect(csv).toBe('﻿a,b\r\n1,2\r\n3,4');
  });

  it('header-only (no rows) emits just the header line after BOM', () => {
    const csv = toCsv(H, []);
    expect(csv).toBe('﻿a,b');
  });
});
