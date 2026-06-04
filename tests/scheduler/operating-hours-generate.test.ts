import { generateShiftsFromOperatingHours } from '../../src/modules/scheduler/operating-hours.service';

/**
 * Tests for generateShiftsFromOperatingHours + its internal windowsFor split logic.
 *
 * windowsFor(startH, endH, maxHoursDay):
 *   total = endH - startH
 *   if total <= maxHoursDay -> [[startH, endH]]               (single window)
 *   else mid = startH + total/2 -> [[startH, mid], [mid, endH]] (two equal halves)
 *
 * generateShiftsFromOperatingHours per open day creates one shift per window.
 * Overnight when businessHoursEnd <= businessHoursStart -> endHours += 24.
 *
 * Calendar pinning:
 *   weekStart (periodStartDate) = 2026-06-07 (a SUNDAY), day index 0.
 *   Asia/Jerusalem in June is IDT = UTC+3, so local HH:00 = (HH-3):00 UTC.
 *   e.g. local 08:00 on 2026-06-07 -> 2026-06-07T05:00:00.000Z.
 */

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOC_ID = '00000000-0000-0000-0000-000000000002';
const SCHEDULE_ID = '00000000-0000-0000-0000-000000000099';

const WEEK_START = new Date('2026-06-07T00:00:00Z'); // Sunday

interface FakeScheduleOpts {
  periodStartDate?: Date;
  timezone?: string | null;
  locationId?: string | null;
  orgRules?: unknown;
  locationRules?: unknown;
}

function makeSchedule(opts: FakeScheduleOpts = {}) {
  return {
    id: SCHEDULE_ID,
    periodStartDate: opts.periodStartDate ?? WEEK_START,
    timezone: opts.timezone === undefined ? 'Asia/Jerusalem' : opts.timezone,
    locationId: opts.locationId === undefined ? LOC_ID : opts.locationId,
    organization: { laborRulesJsonb: opts.orgRules ?? null },
    location: opts.locationId === null ? null : { laborRulesJsonb: opts.locationRules ?? null },
  };
}

interface FakeDbOpts {
  schedule?: ReturnType<typeof makeSchedule> | null;
  existingCount?: number;
}

function makeDb(opts: FakeDbOpts = {}) {
  const created: any[] = [];
  const calls = {
    scheduleFindFirst: [] as any[],
    shiftCount: [] as any[],
  };
  const db = {
    schedule: {
      findFirst: jest.fn(async (args: any) => {
        calls.scheduleFindFirst.push(args);
        return opts.schedule === undefined ? makeSchedule() : opts.schedule;
      }),
    },
    shift: {
      count: jest.fn(async (args: any) => {
        calls.shiftCount.push(args);
        return opts.existingCount ?? 0;
      }),
      create: jest.fn(async (args: any) => {
        created.push(args.data);
        return { id: 'shift-' + created.length, ...args.data };
      }),
    },
  } as any;
  return { db, created, calls };
}

/** Build org rules with business hours + a single open day (Sunday, index 0). */
function rules(start: string, end: string, extra: Record<string, unknown> = {}) {
  return {
    businessHoursStart: start,
    businessHoursEnd: end,
    activeDaysOfWeek: [0],
    ...extra,
  };
}

const DUR_HOUR = 3600 * 1000;

describe('generateShiftsFromOperatingHours', () => {
  // ----------------------------------------------------------------------
  // (a) single window when span <= maxHoursDay -> 1 shift/day
  // ----------------------------------------------------------------------
  describe('(a) single window when span <= maxHoursDay', () => {
    // [start, end, maxHoursDay, spanHours]; each yields exactly ONE shift.
    const cases: Array<[string, string, number, number]> = [
      ['08:00', '16:00', 9, 8], // span 8 < max 9
      ['09:00', '17:00', 8, 8], // span 8 == max 8 (boundary, single)
      ['06:00', '14:00', 10, 8], // span 8 < 10
      ['10:00', '13:00', 9, 3], // span 3 < 9
      ['08:00', '20:00', 12, 12], // span 12 == max 12
      ['00:00', '06:00', 9, 6], // span 6 < 9
      ['07:30', '15:30', 9, 8], // span 8 < 9
      ['08:00', '17:00', 9, 9], // span 9 == max 9 (boundary, single)
    ];
    it.each(cases)(
      '%s->%s max=%i span=%ih -> 1 shift, correct duration',
      async (start, end, max, span) => {
        const { db, created } = makeDb({
          schedule: makeSchedule({
            timezone: 'Asia/Jerusalem',
            orgRules: rules(start, end, { maxHoursDay: max }),
          }),
        });
        const res = await generateShiftsFromOperatingHours(
          { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
          db,
        );
        expect(res.shiftsCreated).toBe(1);
        expect(created.length).toBe(1);
        const s = created[0]!;
        const durMs = s.endAtUtc.getTime() - s.startAtUtc.getTime();
        expect(durMs).toBe(span * DUR_HOUR);
        expect(s.status).toBe('PLANNED');
        expect(s.requiredEmployeeCount).toBe(1);
      },
    );

    it('single window keeps exact UTC start/end for 08:00->16:00 on Sun 2026-06-07 (IDT +3)', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: rules('08:00', '16:00', { maxHoursDay: 9 }),
        }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0]!;
      // local 08:00 IDT(+3) -> 05:00 UTC; local 16:00 -> 13:00 UTC
      expect(s.startAtUtc.toISOString()).toBe('2026-06-07T05:00:00.000Z');
      expect(s.endAtUtc.toISOString()).toBe('2026-06-07T13:00:00.000Z');
    });
  });

  // ----------------------------------------------------------------------
  // (b) split into 2 equal windows when span > maxHoursDay
  // ----------------------------------------------------------------------
  describe('(b) split into 2 equal windows when span > maxHoursDay', () => {
    // [start, end, max, firstHalfHours, secondHalfHours]; midpoint is exact half.
    const cases: Array<[string, string, number, number, number]> = [
      ['08:00', '20:00', 9, 6, 6], // span 12 > 9, mid 14:00 -> 6h + 6h
      ['06:00', '18:00', 8, 6, 6], // span 12 > 8, mid 12:00 -> 6h + 6h
      ['08:00', '18:00', 9, 5, 5], // span 10 > 9, mid 13:00 -> 5h + 5h
      ['00:00', '14:00', 6, 7, 7], // span 14 > 6, mid 07:00 -> 7h + 7h
      ['09:00', '23:00', 9, 7, 7], // span 14 > 9, mid 16:00 -> 7h + 7h
      ['08:00', '23:00', 9, 7.5, 7.5], // span 15 > 9, mid 15:30 -> 7.5h + 7.5h
      ['10:00', '22:00', 5, 6, 6], // span 12 > 5, mid 16:00 -> 6h + 6h
    ];
    it.each(cases)(
      '%s->%s max=%i -> 2 shifts of %ih + %ih, contiguous, total = span',
      async (start, end, max, first, second) => {
        const { db, created } = makeDb({
          schedule: makeSchedule({
            timezone: 'Asia/Jerusalem',
            orgRules: rules(start, end, { maxHoursDay: max }),
          }),
        });
        const res = await generateShiftsFromOperatingHours(
          { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
          db,
        );
        expect(res.shiftsCreated).toBe(2);
        expect(created.length).toBe(2);
        const a = created[0]!;
        const b = created[1]!;
        expect(a.endAtUtc.getTime() - a.startAtUtc.getTime()).toBe(first * DUR_HOUR);
        expect(b.endAtUtc.getTime() - b.startAtUtc.getTime()).toBe(second * DUR_HOUR);
        // contiguous: first window ends exactly where second begins
        expect(a.endAtUtc.getTime()).toBe(b.startAtUtc.getTime());
        // total coverage equals the full span
        const total = b.endAtUtc.getTime() - a.startAtUtc.getTime();
        expect(total).toBe((first + second) * DUR_HOUR);
      },
    );

    it('exact midpoint UTC for 08:00->20:00 max=9 on Sun 2026-06-07: split at 14:00 local', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: rules('08:00', '20:00', { maxHoursDay: 9 }),
        }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const a = created[0]!;
      const b = created[1]!;
      // local 08:00 IDT(+3) -> 05:00 UTC, mid 14:00 -> 11:00 UTC, 20:00 -> 17:00 UTC
      expect(a.startAtUtc.toISOString()).toBe('2026-06-07T05:00:00.000Z');
      expect(a.endAtUtc.toISOString()).toBe('2026-06-07T11:00:00.000Z');
      expect(b.startAtUtc.toISOString()).toBe('2026-06-07T11:00:00.000Z');
      expect(b.endAtUtc.toISOString()).toBe('2026-06-07T17:00:00.000Z');
    });
  });

  // ----------------------------------------------------------------------
  // (c) boundary: span == max -> single ; span == max + epsilon -> split
  // ----------------------------------------------------------------------
  describe('(c) boundary span==max (single) vs span>max (split)', () => {
    // span exactly equal to max -> single window (total <= max).
    const singleCases: Array<[string, string, number]> = [
      ['08:00', '17:00', 9], // span 9 == 9
      ['08:00', '16:00', 8], // span 8 == 8
      ['08:00', '14:30', 6.5], // span 6.5 == 6.5
      ['00:00', '10:00', 10], // span 10 == 10
    ];
    it.each(singleCases)('span==max for %s->%s max=%i -> 1 shift', async (start, end, max) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: rules(start, end, { maxHoursDay: max }),
        }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.shiftsCreated).toBe(1);
      expect(created.length).toBe(1);
    });

    // span = max + 0.5h (epsilon over) -> split into two.
    const splitCases: Array<[string, string, number]> = [
      ['08:00', '17:30', 9], // span 9.5 > 9
      ['08:00', '16:30', 8], // span 8.5 > 8
      ['00:00', '10:30', 10], // span 10.5 > 10
      ['08:00', '15:00', 6.5], // span 7 > 6.5
    ];
    it.each(splitCases)(
      'span==max+epsilon for %s->%s max=%i -> 2 shifts',
      async (start, end, max) => {
        const { db, created } = makeDb({
          schedule: makeSchedule({
            timezone: 'Asia/Jerusalem',
            orgRules: rules(start, end, { maxHoursDay: max }),
          }),
        });
        const res = await generateShiftsFromOperatingHours(
          { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
          db,
        );
        expect(res.shiftsCreated).toBe(2);
        expect(created.length).toBe(2);
      },
    );

    it('default maxHoursDay = 9 when unspecified: span 9 single, span 10 split', async () => {
      // No maxHoursDay -> service defaults to 9.
      const single = makeDb({
        schedule: makeSchedule({ timezone: 'Asia/Jerusalem', orgRules: rules('08:00', '17:00') }),
      });
      const r1 = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        single.db,
      );
      expect(r1.shiftsCreated).toBe(1); // span 9 == default 9

      const split = makeDb({
        schedule: makeSchedule({ timezone: 'Asia/Jerusalem', orgRules: rules('08:00', '18:00') }),
      });
      const r2 = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        split.db,
      );
      expect(r2.shiftsCreated).toBe(2); // span 10 > default 9
    });
  });

  // ----------------------------------------------------------------------
  // (d) overnight: businessHoursEnd <= businessHoursStart -> +24
  // ----------------------------------------------------------------------
  describe('(d) overnight windows (end <= start -> +24)', () => {
    it('18:00->02:00 span 8h, single shift when max>=8', async () => {
      // start 18, end 02 -> 26, span = 8.
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: rules('18:00', '02:00', { maxHoursDay: 9 }),
        }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.shiftsCreated).toBe(1);
      const s = created[0]!;
      expect(s.endAtUtc.getTime() - s.startAtUtc.getTime()).toBe(8 * DUR_HOUR);
      // local 18:00 IDT(+3) Sun -> 15:00 UTC; end 26:00 = next day 02:00 local -> 23:00 UTC same day
      expect(s.startAtUtc.toISOString()).toBe('2026-06-07T15:00:00.000Z');
      expect(s.endAtUtc.toISOString()).toBe('2026-06-07T23:00:00.000Z');
    });

    // [start, end, max, spanHours, expectedShifts]
    const cases: Array<[string, string, number, number, number]> = [
      ['18:00', '02:00', 9, 8, 1], // span 8 <= 9 single
      ['22:00', '06:00', 9, 8, 1], // span 8 single
      ['20:00', '08:00', 9, 12, 2], // span 12 > 9 split (mid 02:00 -> 6h+6h)
      ['18:00', '06:00', 6, 12, 2], // span 12 > 6 split
      ['23:00', '07:00', 8, 8, 1], // span 8 == 8 single
      ['16:00', '02:00', 9, 10, 2], // span 10 > 9 split
    ];
    it.each(cases)(
      'overnight %s->%s max=%i span=%ih -> %i shift(s)',
      async (start, end, max, span, n) => {
        const { db, created } = makeDb({
          schedule: makeSchedule({
            timezone: 'Asia/Jerusalem',
            orgRules: rules(start, end, { maxHoursDay: max }),
          }),
        });
        const res = await generateShiftsFromOperatingHours(
          { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
          db,
        );
        expect(res.shiftsCreated).toBe(n);
        expect(created.length).toBe(n);
        // total coverage across windows equals span
        const first = created[0]!;
        const last = created[created.length - 1]!;
        const total = last.endAtUtc.getTime() - first.startAtUtc.getTime();
        expect(total).toBe(span * DUR_HOUR);
      },
    );
  });

  // ----------------------------------------------------------------------
  // (e) openDays count multiplies shifts
  // ----------------------------------------------------------------------
  describe('(e) openDays count multiplies shift count', () => {
    // single-window business hours (08:00-16:00, span 8 <= 9) -> 1 shift/day.
    const single: Array<[number[], number]> = [
      [[0], 1],
      [[0, 1], 2],
      [[0, 1, 2, 3, 4], 5],
      [[0, 1, 2, 3, 4, 5, 6], 7],
      [[2, 4], 2],
    ];
    it.each(single)('single-window days=%j -> %i shifts', async (days, n) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', maxHoursDay: 9, activeDaysOfWeek: days },
        }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.shiftsCreated).toBe(n);
      expect(created.length).toBe(n);
      expect(res.openDays).toEqual(days);
    });

    // split business hours (08:00-20:00, span 12 > 9) -> 2 shifts/day.
    const split: Array<[number[], number]> = [
      [[0], 2],
      [[0, 1], 4],
      [[0, 1, 2, 3, 4], 10],
      [[0, 1, 2, 3, 4, 5, 6], 14],
      [[1, 3, 5], 6],
    ];
    it.each(split)('split-window days=%j -> %i shifts (2/day)', async (days, n) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '20:00', maxHoursDay: 9, activeDaysOfWeek: days },
        }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.shiftsCreated).toBe(n);
      expect(created.length).toBe(n);
    });

    it('maps day indices to correct calendar dates off 2026-06-07 (UTC tz)', async () => {
      // days [0,2,6] off Sunday 2026-06-07 -> 07, 09, 13; UTC so local==UTC date.
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'UTC',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', maxHoursDay: 9, activeDaysOfWeek: [0, 2, 6] },
        }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const dates = created.map((c) => c.startAtUtc.toISOString().slice(0, 10)).sort();
      expect(dates).toEqual(['2026-06-07', '2026-06-09', '2026-06-13']);
    });

    it('derives open days from dailyStandards (hours > 0)', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: {
            businessHoursStart: '08:00',
            businessHoursEnd: '16:00',
            maxHoursDay: 9,
            dailyStandards: { '0': 8, '1': 0, '2': 8, '3': 8, '4': 0, '5': 0, '6': 5 },
          },
        }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.openDays).toEqual([0, 2, 3, 6]);
      expect(res.shiftsCreated).toBe(4); // 4 open days * 1 shift
    });
  });

  // ----------------------------------------------------------------------
  // (f) no_business_hours + idempotency
  // ----------------------------------------------------------------------
  describe('(f) no_business_hours and idempotency', () => {
    it.each([
      [null, null],
      [{}, null],
      [{ businessHoursStart: '08:00' }, null], // missing end
      [{ businessHoursEnd: '16:00' }, null], // missing start
    ])('returns no_business_hours when hours unparseable (org=%p)', async (orgRules, locRules) => {
      const { db, created, calls } = makeDb({
        schedule: makeSchedule({ orgRules, locationRules: locRules }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.message).toBe('no_business_hours');
      expect(res.shiftsCreated).toBe(0);
      expect(res.openDays).toEqual([]);
      expect(created.length).toBe(0);
      // short-circuits before counting existing shifts
      expect(calls.shiftCount.length).toBe(0);
    });

    it.each([1, 2, 25])('idempotent: existing count = %i -> week_already_has_shifts', async (n) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', maxHoursDay: 9, activeDaysOfWeek: [0, 1, 2] },
        }),
        existingCount: n,
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.message).toBe('week_already_has_shifts');
      expect(res.shiftsCreated).toBe(0);
      // openDays still reflects parsed config
      expect(res.openDays).toEqual([0, 1, 2]);
      expect(created.length).toBe(0);
    });

    it('count query excludes CANCELLED shifts and scopes by org+schedule', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ orgRules: rules('08:00', '16:00', { maxHoursDay: 9 }) }),
        existingCount: 0,
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.shiftCount[0]!.where;
      expect(where.status).toEqual({ not: 'CANCELLED' });
      expect(where.scheduleId).toBe(SCHEDULE_ID);
      expect(where.organizationId).toBe(ORG_ID);
    });

    it('location rules override org business hours', async () => {
      // org says single (08-16) but location says split (08-22) -> 2 shifts/day.
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', maxHoursDay: 9, activeDaysOfWeek: [0] },
          locationRules: { businessHoursStart: '08:00', businessHoursEnd: '22:00' },
        }),
      });
      const res = await generateShiftsFromOperatingHours(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      // span 14 > max 9 -> split into 2
      expect(res.shiftsCreated).toBe(2);
    });
  });

  // ----------------------------------------------------------------------
  // (g) schedule not found -> 404
  // ----------------------------------------------------------------------
  describe('(g) schedule not found', () => {
    it('throws 404 NOT_FOUND when findFirst returns null', async () => {
      const { db, created } = makeDb({ schedule: null });
      await expect(
        generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(created.length).toBe(0);
    });

    it('scopes findFirst by id and organizationId', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ orgRules: rules('08:00', '16:00', { maxHoursDay: 9 }) }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(calls.scheduleFindFirst[0]!.where).toEqual({ id: SCHEDULE_ID, organizationId: ORG_ID });
    });
  });

  // ----------------------------------------------------------------------
  // Bug surface: non-integer split times when span/2 is fractional.
  // For odd-hour spans (e.g. 15h, span/2 = 7.5h) the midpoint lands on a
  // half-hour boundary -> shift starts/ends at :30. Not a crash, but the
  // split produces a non-:00 boundary. Documented here as a value check.
  // ----------------------------------------------------------------------
  describe('split boundary precision (Bug surface: fractional midpoints)', () => {
    it('08:00->23:00 (span 15, max 9) splits at 15:30 local -> half-hour boundary', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: rules('08:00', '23:00', { maxHoursDay: 9 }),
        }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const a = created[0]!;
      const b = created[1]!;
      // mid = 8 + 15/2 = 15.5 -> local 15:30 IDT(+3) -> 12:30 UTC
      expect(a.endAtUtc.toISOString()).toBe('2026-06-07T12:30:00.000Z');
      expect(b.startAtUtc.toISOString()).toBe('2026-06-07T12:30:00.000Z');
      // each half is 7.5h
      expect(a.endAtUtc.getTime() - a.startAtUtc.getTime()).toBe(7.5 * DUR_HOUR);
      expect(b.endAtUtc.getTime() - b.startAtUtc.getTime()).toBe(7.5 * DUR_HOUR);
    });

    it('07:00->20:00 (span 13, max 9) splits at 13:30 local -> half-hour boundary', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: rules('07:00', '20:00', { maxHoursDay: 9 }),
        }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const a = created[0]!;
      // mid = 7 + 13/2 = 13.5 -> local 13:30 IDT(+3) -> 10:30 UTC
      expect(a.endAtUtc.toISOString()).toBe('2026-06-07T10:30:00.000Z');
      expect(a.endAtUtc.getTime() - a.startAtUtc.getTime()).toBe(6.5 * DUR_HOUR);
    });
  });

  // ----------------------------------------------------------------------
  // shift.create payload shape
  // ----------------------------------------------------------------------
  describe('created shift payload shape', () => {
    it('stamps org/schedule/location, timezone, status PLANNED, count 1', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          locationId: LOC_ID,
          orgRules: rules('08:00', '16:00', { maxHoursDay: 9 }),
        }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0]!;
      expect(s.organizationId).toBe(ORG_ID);
      expect(s.scheduleId).toBe(SCHEDULE_ID);
      expect(s.locationId).toBe(LOC_ID);
      expect(s.timezone).toBe('Asia/Jerusalem');
      expect(s.status).toBe('PLANNED');
      expect(s.requiredEmployeeCount).toBe(1);
    });

    it('falls back to DEFAULT_TZ Asia/Jerusalem when schedule timezone empty', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ timezone: '', orgRules: rules('08:00', '16:00', { maxHoursDay: 9 }) }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.timezone).toBe('Asia/Jerusalem');
    });

    it('null schedule locationId -> shift locationId null', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ locationId: null, orgRules: rules('08:00', '16:00', { maxHoursDay: 9 }) }),
      });
      await generateShiftsFromOperatingHours({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.locationId).toBeNull();
    });
  });
});
