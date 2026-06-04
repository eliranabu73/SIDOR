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

function makeSchedule(opts: { orgRules?: unknown } = {}) {
  return {
    id: SCHEDULE_ID,
    periodStartDate: new Date('2026-05-24T00:00:00Z'), // Sunday
    timezone: 'Asia/Jerusalem',
    locationId: LOC_ID,
    organization: { laborRulesJsonb: opts.orgRules ?? null },
    location: { laborRulesJsonb: null },
  };
}

// A fake existing Shift row used to model deleteMany filtering + post-delete count.
interface FakeShift {
  id: string;
  status: string;
  templateId: string | null;
  assignmentCount: number; // number of non-cancelled assignments
}

interface FakeDbOpts {
  schedule?: ReturnType<typeof makeSchedule> | null;
  templates?: FakeTemplate[];
  /** Existing shift rows in the target week (for replace / count behavior). */
  existingShifts?: FakeShift[];
}

/**
 * Evaluate the service's deleteMany `where` against a fake shift row, mirroring
 * the production predicate:
 *   status != CANCELLED AND ( templateId != null OR (status PLANNED AND no assignments) )
 */
function matchesDeleteWhere(where: any, s: FakeShift): boolean {
  if (where.status?.not === 'CANCELLED' && s.status === 'CANCELLED') return false;
  const or: any[] = where.OR ?? [];
  return or.some((clause) => {
    if (clause.templateId && clause.templateId.not === null) {
      return s.templateId !== null;
    }
    if (clause.status === 'PLANNED' && clause.assignments?.none) {
      return s.status === 'PLANNED' && s.assignmentCount === 0;
    }
    return false;
  });
}

function makeDb(opts: FakeDbOpts = {}) {
  const created: any[] = [];
  let shifts: FakeShift[] = [...(opts.existingShifts ?? [])];
  const calls = {
    deleteMany: [] as any[],
    shiftCount: [] as any[],
  };
  const db = {
    schedule: {
      findFirst: jest.fn(async () => (opts.schedule === undefined ? makeSchedule() : opts.schedule)),
    },
    shiftTemplate: {
      findMany: jest.fn(async () => opts.templates ?? []),
    },
    shift: {
      count: jest.fn(async (args: any) => {
        calls.shiftCount.push(args);
        return shifts.filter((s) => s.status !== 'CANCELLED').length;
      }),
      deleteMany: jest.fn(async (args: any) => {
        calls.deleteMany.push(args);
        const before = shifts.length;
        shifts = shifts.filter((s) => !matchesDeleteWhere(args.where, s));
        return { count: before - shifts.length };
      }),
      create: jest.fn(async (args: any) => {
        created.push(args.data);
        return { id: 'shift-' + created.length, ...args.data };
      }),
    },
  } as any;
  return { db, created, calls, remaining: () => shifts };
}

const SUN_THU = { activeDaysOfWeek: [0, 1, 2, 3, 4], businessHoursStart: '08:00', businessHoursEnd: '16:00' };

describe('generateShiftsFromShiftTemplates — replace flag', () => {
  describe('replace=true deletes auto-only shifts and regenerates', () => {
    it('drops templateId-tagged + PLANNED/no-assignment shifts, recreates N=openDays*templates', async () => {
      const existing: FakeShift[] = [
        { id: 's1', status: 'PLANNED', templateId: 'old-tpl', assignmentCount: 0 }, // auto (templateId)
        { id: 's2', status: 'PLANNED', templateId: null, assignmentCount: 0 }, // auto (planned+empty, from operating-hours)
        { id: 's3', status: 'PLANNED', templateId: null, assignmentCount: 0 }, // auto (the 2nd operating-hours window)
      ];
      const templates = [makeTemplate({ id: 'tA' }), makeTemplate({ id: 'tB', startLocalTime: '14:00', endLocalTime: '22:00' }), makeTemplate({ id: 'tC', startLocalTime: '22:00', endLocalTime: '06:00' })];
      const { db, created, calls, remaining } = makeDb({
        schedule: makeSchedule({ orgRules: SUN_THU }),
        templates,
        existingShifts: existing,
      });

      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: true },
        db,
      );

      // All three auto shifts were deleted.
      expect(db.shift.deleteMany).toHaveBeenCalledTimes(1);
      expect(remaining().length).toBe(0);
      // Regenerated 5 open days * 3 templates = 15.
      expect(res.shiftsCreated).toBe(15);
      expect(created.length).toBe(15);
      expect(res.templatesFound).toBe(3);
      expect(res.templatesUsed).toBe(3);
      // No idempotency bail-out: count() is never consulted in replace mode.
      expect(calls.shiftCount.length).toBe(0);
      // deleteMany scoped to this org+schedule, excludes CANCELLED.
      const where = calls.deleteMany[0].where;
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.scheduleId).toBe(SCHEDULE_ID);
      expect(where.status).toEqual({ not: 'CANCELLED' });
    });
  });

  describe('replace=true KEEPS shifts that have assignments', () => {
    it('never deletes a staffed shift and does not double-create', async () => {
      const existing: FakeShift[] = [
        { id: 'staffed', status: 'PLANNED', templateId: null, assignmentCount: 2 }, // manually staffed -> keep
        { id: 'manual-confirmed', status: 'CONFIRMED', templateId: null, assignmentCount: 1 }, // edited/confirmed -> keep
        { id: 'auto', status: 'PLANNED', templateId: 'x', assignmentCount: 0 }, // auto -> delete
      ];
      const templates = [makeTemplate({ id: 'tA' })];
      const { db, created, remaining } = makeDb({
        schedule: makeSchedule({ orgRules: SUN_THU }),
        templates,
        existingShifts: existing,
      });

      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: true },
        db,
      );

      const remIds = remaining().map((s) => s.id).sort();
      expect(remIds).toEqual(['manual-confirmed', 'staffed']);
      // Only the auto shift was removed.
      expect(remaining().length).toBe(2);
      // Regeneration is the plain cross product — no awareness of kept rows,
      // so it does NOT double-create per kept shift (5 days * 1 template).
      expect(res.shiftsCreated).toBe(5);
      expect(created.length).toBe(5);
    });

    it('a PLANNED shift with assignments is NOT auto (kept), only templateId/empty-PLANNED go', async () => {
      const existing: FakeShift[] = [
        { id: 'planned-staffed', status: 'PLANNED', templateId: null, assignmentCount: 1 }, // keep
      ];
      const { db, remaining } = makeDb({
        schedule: makeSchedule({ orgRules: SUN_THU }),
        templates: [makeTemplate()],
        existingShifts: existing,
      });
      await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: true },
        db,
      );
      expect(remaining().map((s) => s.id)).toEqual(['planned-staffed']);
    });
  });

  describe('replace=false unchanged idempotency', () => {
    it.each([1, 2, 50])('returns week_already_has_shifts when existing=%i and deletes nothing', async (n) => {
      const existing: FakeShift[] = Array.from({ length: n }, (_, i) => ({
        id: 's' + i,
        status: 'PLANNED',
        templateId: 'x',
        assignmentCount: 0,
      }));
      const { db, created, calls } = makeDb({
        schedule: makeSchedule({ orgRules: SUN_THU }),
        templates: [makeTemplate()],
        existingShifts: existing,
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: false },
        db,
      );
      expect(res.message).toBe('week_already_has_shifts');
      expect(res.shiftsCreated).toBe(0);
      expect(res.templatesFound).toBe(1);
      expect(res.templatesUsed).toBe(1);
      expect(created.length).toBe(0);
      expect(db.shift.deleteMany).not.toHaveBeenCalled();
      expect(calls.shiftCount.length).toBe(1);
    });

    it('omitting replace behaves like replace=false (idempotent)', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: SUN_THU }),
        templates: [makeTemplate()],
        existingShifts: [{ id: 's', status: 'PLANNED', templateId: 'x', assignmentCount: 0 }],
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.message).toBe('week_already_has_shifts');
      expect(created.length).toBe(0);
      expect(db.shift.deleteMany).not.toHaveBeenCalled();
    });

    it('replace=false on an empty week still generates normally', async () => {
      const { db, created } = makeDb({
        schedule: makeSchedule({ orgRules: SUN_THU }),
        templates: [makeTemplate()],
        existingShifts: [],
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: false },
        db,
      );
      expect(res.shiftsCreated).toBe(5);
      expect(created.length).toBe(5);
      expect(db.shift.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('templatesFound returned in all cases', () => {
    it('templatesFound=0 with no_templates (replace true or false)', async () => {
      for (const replace of [true, false, undefined]) {
        const { db, created } = makeDb({
          schedule: makeSchedule({ orgRules: SUN_THU }),
          templates: [],
        });
        const res = await generateShiftsFromShiftTemplates(
          { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace },
          db,
        );
        expect(res.message).toBe('no_templates');
        expect(res.templatesFound).toBe(0);
        expect(res.templatesUsed).toBe(0);
        expect(res.shiftsCreated).toBe(0);
        expect(created.length).toBe(0);
        // never deletes when there are no templates
        expect(db.shift.deleteMany).not.toHaveBeenCalled();
      }
    });

    it.each([1, 2, 3])('templatesFound=%i on a successful empty-week generate', async (n) => {
      const templates = Array.from({ length: n }, (_, i) =>
        makeTemplate({ id: 't' + i, startLocalTime: `0${i}:00`, endLocalTime: `1${i}:00` }),
      );
      const { db } = makeDb({
        schedule: makeSchedule({ orgRules: { ...SUN_THU, activeDaysOfWeek: [0] } }),
        templates,
        existingShifts: [],
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID },
        db,
      );
      expect(res.templatesFound).toBe(n);
      expect(res.templatesUsed).toBe(n);
    });

    it('templatesFound returned on the replace-true regenerate path', async () => {
      const { db } = makeDb({
        schedule: makeSchedule({ orgRules: { ...SUN_THU, activeDaysOfWeek: [0] } }),
        templates: [makeTemplate(), makeTemplate({ id: 't2', startLocalTime: '12:00', endLocalTime: '20:00' })],
        existingShifts: [{ id: 's', status: 'PLANNED', templateId: 'old', assignmentCount: 0 }],
      });
      const res = await generateShiftsFromShiftTemplates(
        { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: true },
        db,
      );
      expect(res.templatesFound).toBe(2);
      expect(res.shiftsCreated).toBe(2);
    });
  });

  describe('schedule not found still throws (replace mode)', () => {
    it('throws 404 before any delete', async () => {
      const { db } = makeDb({ schedule: null });
      await expect(
        generateShiftsFromShiftTemplates(
          { scheduleId: SCHEDULE_ID, organizationId: ORG_ID, replace: true },
          db,
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(db.shift.deleteMany).not.toHaveBeenCalled();
    });
  });
});
