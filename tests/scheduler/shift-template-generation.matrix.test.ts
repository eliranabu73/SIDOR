import { generateShiftsFromShiftTemplates } from '../../src/modules/scheduler/operating-hours.service';

/**
 * MATRIX breadth tests for generateShiftsFromShiftTemplates.
 *
 * Deterministic dates (no clock/random in expectations):
 *   SUMMER week (Israel DST, IDT = UTC+3): periodStartDate Sunday 2026-06-07.
 *     -> 2026-06-07..2026-06-13 are all within IDT, so Asia/Jerusalem local
 *        time is UTC+3 the whole week. (DST in Israel runs Mar..Oct 2026.)
 *   WINTER week (Israel standard, IST = UTC+2): periodStartDate Sunday 2026-01-04.
 *     -> 2026-01-04..2026-01-10 are all standard time, Asia/Jerusalem = UTC+2.
 *
 * America/New_York on the summer week is EDT = UTC-4.
 * UTC is always UTC+0.
 *
 * Money: N/A here (shift counts/instants only).
 */

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOC_ID = '00000000-0000-0000-0000-000000000002';
const SCHEDULE_ID = '00000000-0000-0000-0000-000000000099';

// Sunday, summer (IDT = UTC+3 across the whole week)
const SUMMER_SUNDAY = new Date('2026-06-07T00:00:00Z');
// Sunday, winter (IST = UTC+2 across the whole week)
const WINTER_SUNDAY = new Date('2026-01-04T00:00:00Z');

interface FakeTemplate {
  id: string;
  organizationId: string;
  locationId: string | null;
  roleId: string | null;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: number;
  timezone: string | null;
}

function makeTemplate(overrides: Partial<FakeTemplate> = {}): FakeTemplate {
  return {
    id: 'tpl-' + Math.random().toString(36).slice(2, 8),
    organizationId: ORG_ID,
    locationId: null,
    roleId: 'role-1',
    startLocalTime: '08:00',
    endLocalTime: '16:00',
    requiredEmployeeCount: 1,
    timezone: null,
    ...overrides,
  };
}

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
    periodStartDate: opts.periodStartDate ?? SUMMER_SUNDAY,
    timezone: opts.timezone === undefined ? 'Asia/Jerusalem' : opts.timezone,
    locationId: opts.locationId === undefined ? LOC_ID : opts.locationId,
    organization: { laborRulesJsonb: opts.orgRules ?? null },
    location: opts.locationId === null ? null : { laborRulesJsonb: opts.locationRules ?? null },
  };
}

interface FakeDbOpts {
  schedule?: ReturnType<typeof makeSchedule> | null;
  templates?: FakeTemplate[];
  existingCount?: number;
}

function makeDb(opts: FakeDbOpts = {}) {
  const created: any[] = [];
  const calls = {
    scheduleFindFirst: [] as any[],
    templateFindMany: [] as any[],
    shiftCount: [] as any[],
  };
  const db = {
    schedule: {
      findFirst: jest.fn(async (args: any) => {
        calls.scheduleFindFirst.push(args);
        return opts.schedule === undefined ? makeSchedule() : opts.schedule;
      }),
    },
    shiftTemplate: {
      findMany: jest.fn(async (args: any) => {
        calls.templateFindMany.push(args);
        return opts.templates ?? [];
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

const HOUR_MS = 3600 * 1000;

describe('generateShiftsFromShiftTemplates — MATRIX', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. openDays x templates cross-product sizes (1..7 days x 1..6 templates)
  //    N created = days.length * templates.length. Hand-listed product below.
  // ─────────────────────────────────────────────────────────────────────────
  describe('count matrix: N = days.length * tplCount', () => {
    // day-set choices of each length 1..7 (literal arrays)
    const daySets: Record<number, number[]> = {
      1: [3],
      2: [0, 1],
      3: [0, 1, 2],
      4: [0, 1, 2, 3],
      5: [0, 1, 2, 3, 4],
      6: [0, 1, 2, 3, 4, 5],
      7: [0, 1, 2, 3, 4, 5, 6],
    };
    const cases: Array<{ dlen: number; tpl: number; expected: number }> = [];
    // dlen 1..7, tpl 1..6  -> hand-computed product literal
    const products: number[][] = [
      // tpl: 1   2   3   4   5   6
      [1, 2, 3, 4, 5, 6], // dlen 1
      [2, 4, 6, 8, 10, 12], // dlen 2
      [3, 6, 9, 12, 15, 18], // dlen 3
      [4, 8, 12, 16, 20, 24], // dlen 4
      [5, 10, 15, 20, 25, 30], // dlen 5
      [6, 12, 18, 24, 30, 36], // dlen 6
      [7, 14, 21, 28, 35, 42], // dlen 7
    ];
    for (let dlen = 1; dlen <= 7; dlen++) {
      for (let tpl = 1; tpl <= 6; tpl++) {
        cases.push({ dlen, tpl, expected: products[dlen - 1]![tpl - 1]! });
      }
    }
    it.each(cases)('dlen=$dlen tpl=$tpl -> $expected shifts', async ({ dlen, tpl, expected }) => {
      const days = daySets[dlen]!;
      // distinct, valid, non-overlapping start times so each template is valid
      const templates = Array.from({ length: tpl }, (_, i) =>
        makeTemplate({ id: 'tpl-' + i, startLocalTime: `0${i}:00`, endLocalTime: `1${i}:00` }),
      );
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: days, businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates,
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.shiftsCreated).toBe(expected);
      expect(created.length).toBe(expected);
      expect(res.templatesUsed).toBe(tpl);
      expect(res.openDays).toEqual(days);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Per-template timezone matrix -> correct UTC instant.
  //    Summer week Sunday 2026-06-07, template local start 08:00.
  //      UTC            -> 08:00Z
  //      Asia/Jerusalem -> IDT UTC+3 -> 08:00 - 3 = 05:00Z
  //      America/New_York -> EDT UTC-4 -> 08:00 + 4 = 12:00Z
  // ─────────────────────────────────────────────────────────────────────────
  describe('per-template timezone -> UTC instant (summer Sun 2026-06-07, local 08:00)', () => {
    const cases: Array<{ tz: string; iso: string }> = [
      { tz: 'UTC', iso: '2026-06-07T08:00:00.000Z' },
      { tz: 'Asia/Jerusalem', iso: '2026-06-07T05:00:00.000Z' }, // 08 - 3
      { tz: 'America/New_York', iso: '2026-06-07T12:00:00.000Z' }, // 08 + 4 (EDT)
    ];
    it.each(cases)('tz=$tz -> startAtUtc $iso', async ({ tz, iso }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: SUMMER_SUNDAY,
          timezone: 'UTC', // schedule tz differs; template tz must win
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: '16:00', timezone: tz })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.timezone).toBe(tz);
      expect(created[0]!.startAtUtc.toISOString()).toBe(iso);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Summer vs winter tz correctness for Asia/Jerusalem (prove DST offset).
  //    local 09:00 ->
  //      summer (UTC+3): 06:00Z ; winter (UTC+2): 07:00Z
  //    local 14:30 ->
  //      summer: 11:30Z ; winter: 12:30Z
  //    local 23:00 ->
  //      summer: 20:00Z ; winter: 21:00Z
  // ─────────────────────────────────────────────────────────────────────────
  describe('Asia/Jerusalem summer(+3) vs winter(+2) UTC instants', () => {
    const cases: Array<{
      label: string;
      periodStart: Date;
      local: string;
      isoDate: string;
      utcHHmm: string;
    }> = [
      { label: 'summer 09:00', periodStart: SUMMER_SUNDAY, local: '09:00', isoDate: '2026-06-07', utcHHmm: '06:00' },
      { label: 'winter 09:00', periodStart: WINTER_SUNDAY, local: '09:00', isoDate: '2026-01-04', utcHHmm: '07:00' },
      { label: 'summer 14:30', periodStart: SUMMER_SUNDAY, local: '14:30', isoDate: '2026-06-07', utcHHmm: '11:30' },
      { label: 'winter 14:30', periodStart: WINTER_SUNDAY, local: '14:30', isoDate: '2026-01-04', utcHHmm: '12:30' },
      { label: 'summer 23:00', periodStart: SUMMER_SUNDAY, local: '23:00', isoDate: '2026-06-07', utcHHmm: '20:00' },
      { label: 'winter 23:00', periodStart: WINTER_SUNDAY, local: '23:00', isoDate: '2026-01-04', utcHHmm: '21:00' },
      { label: 'summer 00:00', periodStart: SUMMER_SUNDAY, local: '00:00', isoDate: '2026-06-06', utcHHmm: '21:00' }, // midnight local -> prev day 21:00Z (UTC+3)
      { label: 'winter 00:00', periodStart: WINTER_SUNDAY, local: '00:00', isoDate: '2026-01-03', utcHHmm: '22:00' }, // midnight local -> prev day 22:00Z (UTC+2)
    ];
    it.each(cases)('$label -> $isoDate $utcHHmm Z', async ({ periodStart, local, isoDate, utcHHmm }) => {
      // end one hour after start (same day), so start instant is what we assert
      const [lh, lm] = local.split(':').map(Number) as [number, number];
      const endH = (lh + 1) % 24;
      const endStr = `${String(endH).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: periodStart,
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: local, endLocalTime: endStr, timezone: 'Asia/Jerusalem' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.startAtUtc.toISOString()).toBe(`${isoDate}T${utcHHmm}:00.000Z`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. crossesMidnight grid: start/end -> exact duration (hours), tz-invariant
  //    because both endpoints share the same fixed offset on a single day.
  //    end<=start rolls +1 day. Durations hand-computed.
  // ─────────────────────────────────────────────────────────────────────────
  describe('duration grid (start->end -> hours), Asia/Jerusalem summer', () => {
    const cases: Array<[string, string, number]> = [
      ['08:00', '16:00', 8],
      ['06:30', '14:30', 8],
      ['00:00', '08:00', 8],
      ['09:00', '17:00', 8],
      ['10:15', '18:45', 8.5],
      ['12:15', '17:45', 5.5],
      ['07:05', '07:35', 0.5],
      ['08:00', '08:30', 0.5],
      ['00:00', '12:00', 12],
      ['06:00', '18:00', 12],
      ['08:00', '23:00', 15],
      ['23:00', '01:00', 2], // overnight (+1d) : 24-23+1
      ['20:00', '04:00', 8], // overnight: 24-20+4
      ['22:30', '06:30', 8], // overnight
      ['18:00', '02:00', 8], // overnight
      ['23:30', '00:30', 1], // overnight
      ['09:00', '09:00', 24], // equal -> full +24h
      ['00:00', '00:00', 24], // equal at midnight -> +24h
    ];
    it.each(cases)('%s->%s = %f h', async (s, e, hours) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: SUMMER_SUNDAY,
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: s, endLocalTime: e })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const sh = created[0]!;
      expect(sh.endAtUtc.getTime() - sh.startAtUtc.getTime()).toBe(hours * HOUR_MS);
    });
  });

  // Same grid in UTC to confirm tz independence of duration.
  describe('duration grid in UTC (tz-independent)', () => {
    const cases: Array<[string, string, number]> = [
      ['08:00', '16:00', 8],
      ['00:00', '08:00', 8],
      ['12:15', '17:45', 5.5],
      ['23:00', '01:00', 2], // overnight
      ['09:00', '09:00', 24], // equal -> +24h
    ];
    it.each(cases)('%s->%s = %f h (UTC)', async (s, e, hours) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: SUMMER_SUNDAY,
          timezone: 'UTC',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: s, endLocalTime: e, timezone: 'UTC' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const sh = created[0]!;
      expect(sh.endAtUtc.getTime() - sh.startAtUtc.getTime()).toBe(hours * HOUR_MS);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. requiredEmployeeCount + roleId + templateId copied verbatim.
  // ─────────────────────────────────────────────────────────────────────────
  describe('field copy matrix', () => {
    const cases: Array<{ rec: number; roleId: string | null; id: string }> = [
      { rec: 1, roleId: 'role-a', id: 'tA' },
      { rec: 2, roleId: 'role-b', id: 'tB' },
      { rec: 3, roleId: null, id: 'tC' },
      { rec: 5, roleId: 'role-mgr', id: 'tD' },
      { rec: 7, roleId: 'role-x', id: 'tE' },
      { rec: 10, roleId: null, id: 'tF' },
      { rec: 12, roleId: 'role-y', id: 'tG' },
      { rec: 25, roleId: 'role-z', id: 'tH' },
    ];
    it.each(cases)('rec=$rec roleId=$roleId id=$id copied onto shift', async ({ rec, roleId, id }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ id, roleId, requiredEmployeeCount: rec })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const sh = created[0]!;
      expect(sh.requiredEmployeeCount).toBe(rec);
      expect(sh.roleId).toBe(roleId);
      expect(sh.templateId).toBe(id);
      expect(sh.status).toBe('PLANNED');
      expect(sh.organizationId).toBe(ORG_ID);
      expect(sh.scheduleId).toBe(SCHEDULE_ID);
    });

    it('multi-template: every template stamps its own roleId/rec/templateId on one open day', async () => {
      const templates = cases.map((c) =>
        makeTemplate({
          id: c.id,
          roleId: c.roleId,
          requiredEmployeeCount: c.rec,
          startLocalTime: '08:00',
          endLocalTime: '16:00',
        }),
      );
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates,
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      for (const c of cases) {
        const sh = created.find((x) => x.templateId === c.id)!;
        expect(sh.roleId).toBe(c.roleId);
        expect(sh.requiredEmployeeCount).toBe(c.rec);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. shift.locationId precedence: template.locationId ?? schedule.locationId.
  // ─────────────────────────────────────────────────────────────────────────
  describe('locationId precedence matrix', () => {
    const cases: Array<{ tplLoc: string | null; schedLoc: string | null; expected: string | null }> = [
      { tplLoc: 'loc-tpl', schedLoc: LOC_ID, expected: 'loc-tpl' },
      { tplLoc: null, schedLoc: LOC_ID, expected: LOC_ID },
      { tplLoc: 'loc-tpl', schedLoc: null, expected: 'loc-tpl' },
      { tplLoc: null, schedLoc: null, expected: null },
    ];
    it.each(cases)('tplLoc=$tplLoc schedLoc=$schedLoc -> $expected', async ({ tplLoc, schedLoc, expected }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          locationId: schedLoc,
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ locationId: tplLoc })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.locationId).toBe(expected);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. location-scoped template findMany filter combos.
  // ─────────────────────────────────────────────────────────────────────────
  describe('template findMany filter matrix', () => {
    it.each([LOC_ID, 'loc-X', 'loc-Y'])('schedule loc=%s -> OR [{loc},{null}]', async (loc) => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({
          locationId: loc,
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.templateFindMany[0]!.where;
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.OR).toEqual([{ locationId: loc }, { locationId: null }]);
      expect(calls.templateFindMany[0]!.orderBy).toEqual({ startLocalTime: 'asc' });
    });

    it('no schedule locationId -> OR omitted', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({
          locationId: null,
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.templateFindMany[0]!.where;
      expect(where.OR).toBeUndefined();
      expect(where.organizationId).toBe(ORG_ID);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. openDays derivation matrix (activeDaysOfWeek / dailyStandards / fallback)
  //    + open_days_defaulted message rules.
  // ─────────────────────────────────────────────────────────────────────────
  describe('openDays + message matrix', () => {
    const cases: Array<{
      label: string;
      orgRules: unknown;
      locationRules?: unknown;
      openDays: number[];
      defaulted: boolean;
    }> = [
      {
        label: 'activeDaysOfWeek Sun-Thu (declared, not defaulted)',
        orgRules: { activeDaysOfWeek: [0, 1, 2, 3, 4], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        openDays: [0, 1, 2, 3, 4],
        defaulted: false,
      },
      {
        label: 'activeDaysOfWeek weekend [5,6]',
        orgRules: { activeDaysOfWeek: [5, 6], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        openDays: [5, 6],
        defaulted: false,
      },
      {
        label: 'activeDaysOfWeek single [3]',
        orgRules: { activeDaysOfWeek: [3], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        openDays: [3],
        defaulted: false,
      },
      {
        label: 'activeDaysOfWeek all 7',
        orgRules: { activeDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        openDays: [0, 1, 2, 3, 4, 5, 6],
        defaulted: false,
      },
      {
        label: 'dailyStandards picks >0 days [0,1,3]',
        orgRules: {
          businessHoursStart: '08:00',
          businessHoursEnd: '16:00',
          dailyStandards: { '0': 8, '1': 8, '2': 0, '3': 8, '4': 0, '5': 0, '6': 0 },
        },
        openDays: [0, 1, 3],
        defaulted: false,
      },
      {
        label: 'dailyStandards full week',
        orgRules: {
          businessHoursStart: '08:00',
          businessHoursEnd: '16:00',
          dailyStandards: { '0': 8, '1': 8, '2': 8, '3': 8, '4': 8, '5': 8, '6': 8 },
        },
        openDays: [0, 1, 2, 3, 4, 5, 6],
        defaulted: false,
      },
      {
        label: 'no business hours -> fallback Sun-Thu, defaulted',
        orgRules: null,
        openDays: [0, 1, 2, 3, 4],
        defaulted: true,
      },
      {
        label: 'business hours but no days -> fallback Sun-Thu, defaulted',
        orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        openDays: [0, 1, 2, 3, 4],
        defaulted: true,
      },
      {
        label: 'dailyStandards all zero -> fallback Sun-Thu, defaulted',
        orgRules: {
          businessHoursStart: '08:00',
          businessHoursEnd: '16:00',
          dailyStandards: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 },
        },
        openDays: [0, 1, 2, 3, 4],
        defaulted: true,
      },
      {
        label: 'location rules override org days [5,6]',
        orgRules: { activeDaysOfWeek: [0, 1, 2, 3, 4], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        locationRules: { activeDaysOfWeek: [5, 6] },
        openDays: [5, 6],
        defaulted: false,
      },
    ];
    it.each(cases)('$label', async ({ orgRules, locationRules, openDays, defaulted }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules, locationRules }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.openDays).toEqual(openDays);
      expect(created.length).toBe(openDays.length); // 1 template
      expect(res.shiftsCreated).toBe(openDays.length);
      if (defaulted) {
        expect(res.message).toBe('open_days_defaulted');
      } else {
        expect(res.message).toBeUndefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Calendar-date offset matrix: day index -> periodStart + day (UTC tz).
  //    Summer week Sunday 2026-06-07.
  // ─────────────────────────────────────────────────────────────────────────
  describe('day-index -> calendar date (summer week, UTC tz)', () => {
    const cases: Array<{ day: number; date: string }> = [
      { day: 0, date: '2026-06-07' },
      { day: 1, date: '2026-06-08' },
      { day: 2, date: '2026-06-09' },
      { day: 3, date: '2026-06-10' },
      { day: 4, date: '2026-06-11' },
      { day: 5, date: '2026-06-12' },
      { day: 6, date: '2026-06-13' },
    ];
    it.each(cases)('day=$day -> $date', async ({ day, date }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: SUMMER_SUNDAY,
          timezone: 'UTC',
          orgRules: { activeDaysOfWeek: [day], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: '16:00', timezone: 'UTC' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.startAtUtc.toISOString().slice(0, 10)).toBe(date);
      expect(created[0]!.localStartDate.toISOString().slice(0, 10)).toBe(date);
    });

    // Winter week dates too.
    const winterCases: Array<{ day: number; date: string }> = [
      { day: 0, date: '2026-01-04' },
      { day: 3, date: '2026-01-07' },
      { day: 6, date: '2026-01-10' },
    ];
    it.each(winterCases)('winter day=$day -> $date', async ({ day, date }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: WINTER_SUNDAY,
          timezone: 'UTC',
          orgRules: { activeDaysOfWeek: [day], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: '16:00', timezone: 'UTC' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0]!.startAtUtc.toISOString().slice(0, 10)).toBe(date);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. INVALID_TIME throw matrix on malformed template times.
  // ─────────────────────────────────────────────────────────────────────────
  describe('INVALID_TIME throw matrix', () => {
    const badTimes = [
      'abc',
      '25:99',
      '9',
      '',
      '08:60',
      '24:00',
      '8.5:00',
      '08:5a',
      '-1:00',
      '12:',
      ':30',
      '12:00:00',
      '99:99',
      'aa:bb',
      '23:60',
    ];
    it.each(badTimes)('bad startLocalTime %p throws INVALID_TIME, no shift', async (bad) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ startLocalTime: bad })],
      });
      await expect(
        generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TIME' });
      expect(db.shift.create).not.toHaveBeenCalled();
      expect(created.length).toBe(0);
    });

    it.each(badTimes)('bad endLocalTime %p throws INVALID_TIME, no shift', async (bad) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: bad })],
      });
      await expect(
        generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TIME' });
      expect(db.shift.create).not.toHaveBeenCalled();
      expect(created.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Boundary-valid times accepted (no throw, one shift).
  // ─────────────────────────────────────────────────────────────────────────
  describe('boundary-valid time matrix accepted', () => {
    const cases: Array<{ s: string; e: string }> = [
      { s: '00:00', e: '23:59' },
      { s: '0:0', e: '1:0' }, // single-digit HH/MM accepted by /^\d{1,2}$/
      { s: '23:00', e: '23:59' },
      { s: '00:01', e: '12:00' },
      { s: '09:09', e: '17:17' },
    ];
    it.each(cases)('%o accepted -> 1 valid shift', async ({ s, e }) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: SUMMER_SUNDAY,
          timezone: 'UTC',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: s, endLocalTime: e, timezone: 'UTC' })],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.shiftsCreated).toBe(1);
      expect(Number.isNaN(created[0]!.startAtUtc.getTime())).toBe(false);
      expect(Number.isNaN(created[0]!.endAtUtc.getTime())).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Idempotency + short-circuit matrix.
  // ─────────────────────────────────────────────────────────────────────────
  describe('idempotency matrix (existing shifts skip)', () => {
    it.each([1, 2, 5, 50, 1000])('existing=%i -> week_already_has_shifts, no create', async (n) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0, 1], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate(), makeTemplate({ id: 't2', startLocalTime: '14:00', endLocalTime: '22:00' })],
        existingCount: n,
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBe('week_already_has_shifts');
      expect(res.shiftsCreated).toBe(0);
      expect(res.templatesUsed).toBe(2);
      expect(res.openDays).toEqual([]);
      expect(created.length).toBe(0);
    });

    it('count query excludes CANCELLED and scopes by org+schedule', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.shiftCount[0]!.where;
      expect(where.status).toEqual({ not: 'CANCELLED' });
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.scheduleId).toBe(SCHEDULE_ID);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 13. no_templates and not-found short-circuits.
  // ─────────────────────────────────────────────────────────────────────────
  describe('short-circuit guards', () => {
    it('no templates -> no_templates, no count query, no create', async () => {
      const { db, created, calls } = makeDb({ schedule: makeSchedule(), templates: [] });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBe('no_templates');
      expect(res.shiftsCreated).toBe(0);
      expect(res.templatesUsed).toBe(0);
      expect(res.openDays).toEqual([]);
      expect(created.length).toBe(0);
      expect(calls.shiftCount.length).toBe(0);
    });

    it('schedule not found -> 404 NOT_FOUND', async () => {
      const { db } = makeDb({ schedule: null });
      await expect(
        generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

    it('findFirst scoped by id + organizationId', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(calls.scheduleFindFirst[0]!.where).toEqual({ id: SCHEDULE_ID, organizationId: ORG_ID });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Full cross-product correctness: every (day,template) pair once.
  // ─────────────────────────────────────────────────────────────────────────
  describe('cross-product uniqueness', () => {
    const dayCountCases: Array<{ days: number[]; tplIds: string[] }> = [
      { days: [0, 1], tplIds: ['p1', 'p2'] },
      { days: [0, 1, 2], tplIds: ['p1', 'p2'] },
      { days: [0, 1, 2, 3], tplIds: ['p1', 'p2', 'p3'] },
      { days: [3, 4, 5, 6], tplIds: ['pX'] },
    ];
    it.each(dayCountCases)('days=$days tpls=$tplIds -> unique pairs', async ({ days, tplIds }) => {
      const templates = tplIds.map((id, i) =>
        makeTemplate({ id, startLocalTime: `0${i}:00`, endLocalTime: `1${i}:00`, timezone: 'UTC' }),
      );
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: SUMMER_SUNDAY,
          timezone: 'UTC',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: days },
        }),
        templates,
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const pairs = created.map((c) => `${c.templateId}@${c.startAtUtc.toISOString().slice(0, 10)}`);
      const expected: string[] = [];
      for (const id of tplIds) {
        for (const d of days) {
          const date = new Date(SUMMER_SUNDAY.getTime() + d * 24 * HOUR_MS).toISOString().slice(0, 10);
          expected.push(`${id}@${date}`);
        }
      }
      expect(pairs.sort()).toEqual(expected.sort());
      expect(created.length).toBe(days.length * tplIds.length);
    });
  });
});
