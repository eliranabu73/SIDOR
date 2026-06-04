import { DateTime } from 'luxon';
import { generateShiftsFromShiftTemplates } from '../../src/modules/scheduler/operating-hours.service';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOC_ID = '00000000-0000-0000-0000-000000000002';
const SCHEDULE_ID = '00000000-0000-0000-0000-000000000099';

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
    periodStartDate: opts.periodStartDate ?? new Date('2026-05-24T00:00:00Z'), // Sunday
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

describe('generateShiftsFromShiftTemplates', () => {
  describe('count: N = openDays.length * templates.length', () => {
    const cases: Array<{ days: number[]; tplCount: number }> = [
      { days: [0, 1, 2, 3, 4], tplCount: 1 }, // 5
      { days: [0, 1, 2, 3, 4], tplCount: 3 }, // 15
      { days: [0, 1], tplCount: 2 }, // 4
      { days: [0, 1, 2, 3, 4, 5, 6], tplCount: 2 }, // 14
      { days: [3], tplCount: 4 }, // 4
    ];
    it.each(cases)('days=$days tpl=$tplCount -> N', async ({ days, tplCount }) => {
      const templates = Array.from({ length: tplCount }, (_, i) =>
        makeTemplate({ id: 'tpl-' + i, startLocalTime: `0${i}:00`, endLocalTime: `1${i}:00` }),
      );
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: days, businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates,
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.shiftsCreated).toBe(days.length * tplCount);
      expect(created.length).toBe(days.length * tplCount);
      expect(res.templatesUsed).toBe(tplCount);
      expect(res.openDays).toEqual(days);
    });
  });

  describe('copies roleId / templateId / requiredEmployeeCount', () => {
    it('copies each template field onto every created shift', async () => {
      const templates = [
        makeTemplate({ id: 'tA', roleId: 'roleA', requiredEmployeeCount: 2 }),
        makeTemplate({ id: 'tB', roleId: 'roleB', requiredEmployeeCount: 5, startLocalTime: '14:00', endLocalTime: '22:00' }),
      ];
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '22:00' } }),
        templates,
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      // one open day -> exactly one shift per template
      const a = created.find((c) => c.templateId === 'tA');
      const b = created.find((c) => c.templateId === 'tB');
      expect(a.roleId).toBe('roleA');
      expect(a.requiredEmployeeCount).toBe(2);
      expect(a.templateId).toBe('tA');
      expect(b.roleId).toBe('roleB');
      expect(b.requiredEmployeeCount).toBe(5);
      expect(b.templateId).toBe('tB');
    });

    it.each([1, 2, 3, 7, 10])('requiredEmployeeCount=%i copied verbatim', async (n) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate({ requiredEmployeeCount: n })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created.every((c) => c.requiredEmployeeCount === n)).toBe(true);
    });

    it('preserves null roleId from template', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate({ roleId: null })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0].roleId).toBeNull();
    });

    it('sets status PLANNED and stamps scheduleId/organizationId', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0].status).toBe('PLANNED');
      expect(created[0].scheduleId).toBe(SCHEDULE_ID);
      expect(created[0].organizationId).toBe(ORG_ID);
    });
  });

  describe('crossesMidnight handling', () => {
    // Sunday 2026-05-24 in Asia/Jerusalem (IDT, UTC+3 in summer).
    it('same-day window: 17:00->23:00 stays on the same date, 6h duration', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '23:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '17:00', endLocalTime: '23:00' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0];
      const durMs = s.endAtUtc.getTime() - s.startAtUtc.getTime();
      expect(durMs).toBe(6 * 3600 * 1000);
      // start local hour 17 on Sunday in Jerusalem = 14:00 UTC (DST +3)
      expect(s.startAtUtc.toISOString()).toBe('2026-05-24T14:00:00.000Z');
      expect(s.endAtUtc.toISOString()).toBe('2026-05-24T20:00:00.000Z');
      // localEndDate stays on the same calendar day
      expect(s.localEndDate.toISOString().slice(0, 10)).toBe('2026-05-24');
    });

    it('overnight window: 22:00->06:00 rolls end to +1 day, 8h duration', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '23:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '22:00', endLocalTime: '06:00' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0];
      const durMs = s.endAtUtc.getTime() - s.startAtUtc.getTime();
      expect(durMs).toBe(8 * 3600 * 1000);
      expect(s.endAtUtc.getTime()).toBeGreaterThan(s.startAtUtc.getTime());
      // end calendar date is the next day
      expect(s.localEndDate.toISOString().slice(0, 10)).toBe('2026-05-25');
    });

    it('equal start==end is treated as crossing midnight (+24h)', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '23:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '09:00', endLocalTime: '09:00' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0];
      const durMs = s.endAtUtc.getTime() - s.startAtUtc.getTime();
      expect(durMs).toBe(24 * 3600 * 1000);
    });

    it.each([
      ['08:00', '16:00', 8],
      ['06:30', '14:30', 8],
      ['00:00', '08:00', 8],
      ['12:15', '17:45', 5.5],
      ['23:00', '01:00', 2], // overnight
      ['20:00', '04:00', 8], // overnight
    ])('window %s->%s spans %i hours', async (startT, endT, hours) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: startT, endLocalTime: endT })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0];
      const durMs = s.endAtUtc.getTime() - s.startAtUtc.getTime();
      expect(durMs).toBe(hours * 3600 * 1000);
    });
  });

  describe('per-template timezone', () => {
    it('uses the template timezone when set (overrides schedule tz)', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: '16:00', timezone: 'UTC' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const s = created[0];
      expect(s.timezone).toBe('UTC');
      // 08:00 local in UTC on Sunday 2026-05-24
      expect(s.startAtUtc.toISOString()).toBe('2026-05-24T08:00:00.000Z');
    });

    it('falls back to schedule timezone when template tz is null', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'Asia/Jerusalem',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ timezone: null })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0].timezone).toBe('Asia/Jerusalem');
    });

    it('falls back to DEFAULT_TZ when schedule timezone is empty', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: '',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate({ timezone: null })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created[0].timezone).toBe('Asia/Jerusalem');
    });
  });

  describe('idempotency', () => {
    it.each([1, 2, 50])('returns week_already_has_shifts when existing count = %i', async (n) => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0, 1], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
        existingCount: n,
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBe('week_already_has_shifts');
      expect(res.shiftsCreated).toBe(0);
      expect(res.templatesUsed).toBe(1);
      expect(res.openDays).toEqual([]);
      expect(created.length).toBe(0);
    });

    it('count query excludes CANCELLED shifts', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
        existingCount: 0,
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.shiftCount[0].where;
      expect(where.status).toEqual({ not: 'CANCELLED' });
      expect(where.scheduleId).toBe(SCHEDULE_ID);
      expect(where.organizationId).toBe(ORG_ID);
    });
  });

  describe('no templates', () => {
    it('returns no_templates and creates nothing', async () => {
      const { db, created, calls } = makeDb({
        schedule: makeSchedule(),
        templates: [],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBe('no_templates');
      expect(res.shiftsCreated).toBe(0);
      expect(res.templatesUsed).toBe(0);
      expect(res.openDays).toEqual([]);
      expect(created.length).toBe(0);
      // short-circuits before counting existing shifts
      expect(calls.shiftCount.length).toBe(0);
    });
  });

  describe('schedule not found', () => {
    it('throws a 404 NOT_FOUND error', async () => {
      const { db } = makeDb({ schedule: null });
      await expect(
        generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

    it('scopes findFirst by both scheduleId and organizationId', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(calls.scheduleFindFirst[0].where).toEqual({ id: SCHEDULE_ID, organizationId: ORG_ID });
    });
  });

  describe('location-scoped template filter', () => {
    it('queries OR location-scoped OR null when schedule has a locationId', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ locationId: LOC_ID, orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.templateFindMany[0].where;
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.OR).toEqual([{ locationId: LOC_ID }, { locationId: null }]);
    });

    it('omits the OR filter when the schedule has no locationId', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ locationId: null, orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const where = calls.templateFindMany[0].where;
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.OR).toBeUndefined();
    });

    it('orders templates by startLocalTime asc', async () => {
      const { db, calls } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(calls.templateFindMany[0].orderBy).toEqual({ startLocalTime: 'asc' });
    });

    it('shift.locationId uses template locationId when set, else schedule locationId', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ locationId: LOC_ID, orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [
          makeTemplate({ id: 'tloc', locationId: 'other-loc' }),
          makeTemplate({ id: 'tnull', locationId: null, startLocalTime: '10:00', endLocalTime: '18:00' }),
        ],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(created.find((c) => c.templateId === 'tloc').locationId).toBe('other-loc');
      expect(created.find((c) => c.templateId === 'tnull').locationId).toBe(LOC_ID);
    });
  });

  describe('openDays fallback and derivation', () => {
    it('falls back to Sun-Thu [0,1,2,3,4] when no business hours parsed', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: null, locationRules: null }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.openDays).toEqual([0, 1, 2, 3, 4]);
      expect(res.shiftsCreated).toBe(5);
      expect(created.length).toBe(5);
    });

    it('derives open days from dailyStandards', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: {
            businessHoursStart: '08:00',
            businessHoursEnd: '16:00',
            dailyStandards: { '0': 8, '1': 8, '2': 0, '3': 8, '4': 0, '5': 0, '6': 0 },
          },
        }),
        templates: [makeTemplate(), makeTemplate({ id: 't2', startLocalTime: '12:00', endLocalTime: '20:00' })],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.openDays).toEqual([0, 1, 3]);
      expect(res.shiftsCreated).toBe(3 * 2);
    });

    it('location rules override org rules for open days', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [0, 1, 2, 3, 4] },
          locationRules: { activeDaysOfWeek: [5, 6] },
        }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.openDays).toEqual([5, 6]);
      expect(created.length).toBe(2);
    });

    it('maps each open day to the correct calendar date offset from periodStartDate', async () => {
      // periodStartDate Sunday 2026-05-24, days [0,2,6] -> 24, 26, 30
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: new Date('2026-05-24T00:00:00Z'),
          timezone: 'UTC',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [0, 2, 6] },
        }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: '16:00', timezone: 'UTC' })],
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const dates = created.map((c) => c.startAtUtc.toISOString().slice(0, 10)).sort();
      expect(dates).toEqual(['2026-05-24', '2026-05-26', '2026-05-30']);
    });
  });

  describe('malformed template time strings (Bug 1)', () => {
    it.each(['abc', '25:99', '9', '', '08:60', '24:00', '8.5:00', '08:5a'])(
      'throws INVALID_TIME for startLocalTime %p and creates no shift',
      async (bad) => {
        const { db, created } = makeDb({
          schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
          templates: [makeTemplate({ startLocalTime: bad })],
        });
        await expect(
          generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
        ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TIME' });
        // No Invalid Date row was written.
        expect(db.shift.create).not.toHaveBeenCalled();
        expect(created.length).toBe(0);
      },
    );

    it('throws INVALID_TIME for a malformed endLocalTime', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate({ startLocalTime: '08:00', endLocalTime: '99:99' })],
      });
      await expect(
        generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TIME' });
      expect(db.shift.create).not.toHaveBeenCalled();
      expect(created.length).toBe(0);
    });

    it('names the offending value in the error message', async () => {
      const { db } = makeDb({
        schedule: makeSchedule({ orgRules: { activeDaysOfWeek: [0], businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate({ startLocalTime: '25:99' })],
      });
      await expect(
        generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db),
      ).rejects.toThrow(/25:99/);
    });

    it('accepts boundary-valid times 00:00 and 23:59', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({
          timezone: 'UTC',
          orgRules: { activeDaysOfWeek: [0], businessHoursStart: '00:00', businessHoursEnd: '23:59' },
        }),
        templates: [makeTemplate({ startLocalTime: '00:00', endLocalTime: '23:59', timezone: 'UTC' })],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.shiftsCreated).toBe(1);
      expect(created.length).toBe(1);
      expect(Number.isNaN(created[0].startAtUtc.getTime())).toBe(false);
      expect(Number.isNaN(created[0].endAtUtc.getTime())).toBe(false);
    });
  });

  describe('open_days_defaulted message (Bug 2)', () => {
    it('sets message=open_days_defaulted when no business hours parsed', async () => {
      const { db } = makeDb({
        schedule: makeSchedule({ orgRules: null, locationRules: null }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBe('open_days_defaulted');
      expect(res.openDays).toEqual([0, 1, 2, 3, 4]);
      expect(res.shiftsCreated).toBe(5);
    });

    it('sets message=open_days_defaulted when business hours present but open days undeterminable', async () => {
      const { db } = makeDb({
        // business hours given, but no activeDaysOfWeek and no usable dailyStandards
        schedule: makeSchedule({ orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00' } }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBe('open_days_defaulted');
      expect(res.openDays).toEqual([0, 1, 2, 3, 4]);
    });

    it('does NOT set the message when org genuinely declares Sun-Thu', async () => {
      const { db } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [0, 1, 2, 3, 4], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBeUndefined();
      expect(res.openDays).toEqual([0, 1, 2, 3, 4]);
    });

    it('does NOT set the message for a non-default declared open-day set', async () => {
      const { db } = makeDb({
        schedule: makeSchedule({
          orgRules: { activeDaysOfWeek: [5, 6], businessHoursStart: '08:00', businessHoursEnd: '16:00' },
        }),
        templates: [makeTemplate()],
      });
      const res = await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      expect(res.message).toBeUndefined();
      expect(res.openDays).toEqual([5, 6]);
    });
  });

  describe('cross product correctness', () => {
    it('every (day, template) pair appears exactly once', async () => {
      const days = [0, 1, 2];
      const templates = [
        makeTemplate({ id: 'tpA', startLocalTime: '08:00', endLocalTime: '12:00', timezone: 'UTC' }),
        makeTemplate({ id: 'tpB', startLocalTime: '12:00', endLocalTime: '16:00', timezone: 'UTC' }),
      ];
      const { db, created } = makeDb({
        schedule: makeSchedule({
          periodStartDate: new Date('2026-05-24T00:00:00Z'),
          timezone: 'UTC',
          orgRules: { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: days },
        }),
        templates,
      });
      await generateShiftsFromShiftTemplates({ scheduleId: SCHEDULE_ID, organizationId: ORG_ID }, db);
      const pairs = created.map((c) => `${c.templateId}@${c.startAtUtc.toISOString().slice(0, 10)}`).sort();
      expect(pairs).toEqual(
        [
          'tpA@2026-05-24', 'tpA@2026-05-25', 'tpA@2026-05-26',
          'tpB@2026-05-24', 'tpB@2026-05-25', 'tpB@2026-05-26',
        ].sort(),
      );
    });
  });
});
