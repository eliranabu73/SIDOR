/**
 * Pure unit tests for the shift-template CRUD helpers in
 * src/modules/settings/settings.service.ts.
 *
 * Strategy: every function takes an injectable `db` (defaults to the real
 * prisma). We pass a hand-built fake `db` whose only job is to record the
 * args it receives and return canned rows. No real DB / network is touched.
 *
 * All expected values are hand-computed. The crossesMidnight rule is
 * `end <= start` (string compare on HH:MM). Org-scoping is asserted by
 * inspecting the `where` clause passed to the fake prisma.
 *
 * Determinism: there are no clock/random calls in the source paths under
 * test, so every assertion is pinned to fixed literal inputs.
 */

import {
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
  listShiftTemplates,
  type ShiftTemplateInput,
  type ShiftTemplateRow,
} from '../../src/modules/settings/settings.service';
import type { Db } from '../../src/db/prisma';
import { HttpError } from '../../src/shared/errors';

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const OTHER_ORG_ID = '20000000-0000-0000-0000-000000000002';
const TPL_ID = '30000000-0000-0000-0000-000000000003';
const LOC_ID = '40000000-0000-0000-0000-000000000004';
const ROLE_ID = '50000000-0000-0000-0000-000000000005';
const DEFAULT_TZ = 'Asia/Jerusalem';

// Shape of a persisted row as the source's toRow() consumes it.
interface RawRow {
  id: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: number;
  crossesMidnight: boolean;
  locationId: string | null;
  roleId: string | null;
  timezone: string;
}

function rawRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    id: TPL_ID,
    name: 'בוקר',
    startLocalTime: '08:00',
    endLocalTime: '16:00',
    requiredEmployeeCount: 1,
    crossesMidnight: false,
    locationId: null,
    roleId: null,
    timezone: DEFAULT_TZ,
    ...overrides,
  };
}

/**
 * Build a fake Db. The shiftTemplate delegate records every call's args and
 * returns echoes so we can assert what the service persisted.
 *
 * `createReturns`: when provided, create() resolves it; otherwise create()
 * echoes back its own `data` (plus a fixed id) so we can verify the mapping.
 * `findFirstReturns`: what findFirst resolves (null => 404 path).
 * `updateReturns` / `findManyReturns`: canned outputs for those calls.
 */
function makeDb(opts: {
  findFirstReturns?: RawRow | null;
  createReturns?: RawRow;
  updateReturns?: RawRow;
  findManyReturns?: RawRow[];
} = {}): {
  db: Db;
  calls: {
    create: Array<{ data: Record<string, unknown> }>;
    update: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
    findFirst: Array<{ where: Record<string, unknown> }>;
    findMany: Array<{ where: Record<string, unknown>; orderBy?: unknown }>;
    delete: Array<{ where: Record<string, unknown> }>;
  };
} {
  const calls = {
    create: [] as Array<{ data: Record<string, unknown> }>,
    update: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    findFirst: [] as Array<{ where: Record<string, unknown> }>,
    findMany: [] as Array<{ where: Record<string, unknown>; orderBy?: unknown }>,
    delete: [] as Array<{ where: Record<string, unknown> }>,
  };
  const shiftTemplate = {
    create: (args: { data: Record<string, unknown> }) => {
      calls.create.push(args);
      if (opts.createReturns) return Promise.resolve(opts.createReturns);
      // Echo the persisted data back as a row, attaching a fixed id.
      return Promise.resolve({ id: TPL_ID, ...args.data } as unknown as RawRow);
    },
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      calls.update.push(args);
      if (opts.updateReturns) return Promise.resolve(opts.updateReturns);
      // Echo merged onto the findFirst baseline so partial updates resolve.
      const base = opts.findFirstReturns ?? rawRow();
      return Promise.resolve({ ...base, ...args.data, id: TPL_ID } as unknown as RawRow);
    },
    findFirst: (args: { where: Record<string, unknown> }) => {
      calls.findFirst.push(args);
      return Promise.resolve(
        opts.findFirstReturns === undefined ? rawRow() : opts.findFirstReturns,
      );
    },
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
      calls.findMany.push(args);
      return Promise.resolve(opts.findManyReturns ?? []);
    },
    delete: (args: { where: Record<string, unknown> }) => {
      calls.delete.push(args);
      return Promise.resolve(rawRow());
    },
  };
  return { db: { shiftTemplate } as unknown as Db, calls };
}

describe('createShiftTemplate — crossesMidnight matrix', () => {
  // [start, end, expectedCrossesMidnight]
  const cases: Array<[string, string, boolean]> = [
    ['08:00', '16:00', false], // normal day shift
    ['00:00', '23:59', false], // full day, end > start
    ['22:00', '06:00', true],  // overnight, end < start
    ['23:00', '23:00', true],  // end == start ⇒ end <= start ⇒ crosses
    ['08:00', '08:00', true],  // identical times ⇒ crosses
    ['16:00', '08:00', true],  // evening into morning
    ['00:00', '00:00', true],  // midnight to midnight
    ['09:30', '17:30', false], // half-hour boundaries, normal
    ['17:30', '09:30', true],  // reversed half-hour, crosses
    ['12:00', '12:01', false], // one minute forward
    ['12:01', '12:00', true],  // one minute backward
    ['00:01', '00:00', true],  // just past midnight to midnight
  ];

  it.each(cases)(
    'start=%s end=%s ⇒ crossesMidnight=%s',
    async (start, end, expected) => {
      const { db, calls } = makeDb();
      const input: ShiftTemplateInput = {
        name: 'X',
        startLocalTime: start,
        endLocalTime: end,
      };
      const row = await createShiftTemplate(ORG_ID, input, DEFAULT_TZ, db);
      expect(row.crossesMidnight).toBe(expected);
      // The persisted data must carry the same computed flag.
      expect(calls.create[0]!.data['crossesMidnight']).toBe(expected);
      expect(calls.create[0]!.data['startLocalTime']).toBe(start);
      expect(calls.create[0]!.data['endLocalTime']).toBe(end);
    },
  );
});

describe('createShiftTemplate — defaults & passthrough', () => {
  it('defaults requiredEmployeeCount to 1 when omitted', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'בוקר', startLocalTime: '08:00', endLocalTime: '16:00' },
      DEFAULT_TZ,
      db,
    );
    expect(row.requiredEmployeeCount).toBe(1);
    expect(calls.create[0]!.data['requiredEmployeeCount']).toBe(1);
  });

  it.each([0, 1, 2, 5, 25, 100])(
    'persists explicit requiredEmployeeCount=%s verbatim',
    async (count) => {
      const { db, calls } = makeDb();
      const row = await createShiftTemplate(
        ORG_ID,
        { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00', requiredEmployeeCount: count },
        DEFAULT_TZ,
        db,
      );
      expect(row.requiredEmployeeCount).toBe(count);
      expect(calls.create[0]!.data['requiredEmployeeCount']).toBe(count);
    },
  );

  it('uses defaultTimezone when input.timezone is omitted', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00' },
      DEFAULT_TZ,
      db,
    );
    expect(row.timezone).toBe(DEFAULT_TZ);
    expect(calls.create[0]!.data['timezone']).toBe(DEFAULT_TZ);
  });

  it('prefers input.timezone over defaultTimezone when provided', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00', timezone: 'Europe/London' },
      DEFAULT_TZ,
      db,
    );
    expect(row.timezone).toBe('Europe/London');
    expect(calls.create[0]!.data['timezone']).toBe('Europe/London');
  });

  it.each([
    ['  בוקר  ', 'בוקר'],
    ['\tEvening\n', 'Evening'],
    ['NoSpace', 'NoSpace'],
    ['   leading', 'leading'],
    ['trailing   ', 'trailing'],
    ['  inner space kept  ', 'inner space kept'],
  ])('trims name %j ⇒ %j', async (raw, trimmed) => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: raw, startLocalTime: '08:00', endLocalTime: '16:00' },
      DEFAULT_TZ,
      db,
    );
    expect(row.name).toBe(trimmed);
    expect(calls.create[0]!.data['name']).toBe(trimmed);
  });
});

describe('createShiftTemplate — roleId / locationId null vs valid', () => {
  it('defaults roleId to null when omitted', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00' },
      DEFAULT_TZ,
      db,
    );
    expect(row.roleId).toBeNull();
    expect(calls.create[0]!.data['roleId']).toBeNull();
  });

  it('defaults locationId to null when omitted', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00' },
      DEFAULT_TZ,
      db,
    );
    expect(row.locationId).toBeNull();
    expect(calls.create[0]!.data['locationId']).toBeNull();
  });

  it('coerces explicit null roleId to null', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00', roleId: null },
      DEFAULT_TZ,
      db,
    );
    expect(row.roleId).toBeNull();
    expect(calls.create[0]!.data['roleId']).toBeNull();
  });

  it('persists a valid roleId verbatim', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00', roleId: ROLE_ID },
      DEFAULT_TZ,
      db,
    );
    expect(row.roleId).toBe(ROLE_ID);
    expect(calls.create[0]!.data['roleId']).toBe(ROLE_ID);
  });

  it('persists a valid locationId verbatim', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00', locationId: LOC_ID },
      DEFAULT_TZ,
      db,
    );
    expect(row.locationId).toBe(LOC_ID);
    expect(calls.create[0]!.data['locationId']).toBe(LOC_ID);
  });

  it('persists both roleId and locationId together', async () => {
    const { db, calls } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      {
        name: 'X',
        startLocalTime: '08:00',
        endLocalTime: '16:00',
        roleId: ROLE_ID,
        locationId: LOC_ID,
      },
      DEFAULT_TZ,
      db,
    );
    expect(row.roleId).toBe(ROLE_ID);
    expect(row.locationId).toBe(LOC_ID);
    expect(calls.create[0]!.data['roleId']).toBe(ROLE_ID);
    expect(calls.create[0]!.data['locationId']).toBe(LOC_ID);
  });
});

describe('createShiftTemplate — org-scoping', () => {
  it.each([ORG_ID, OTHER_ORG_ID])(
    'stamps organizationId=%s on the created row',
    async (orgId) => {
      const { db, calls } = makeDb();
      await createShiftTemplate(
        orgId,
        { name: 'X', startLocalTime: '08:00', endLocalTime: '16:00' },
        DEFAULT_TZ,
        db,
      );
      expect(calls.create[0]!.data['organizationId']).toBe(orgId);
    },
  );
});

describe('createShiftTemplate — full row mapping snapshot', () => {
  it('maps every field through toRow() with the echo fake', async () => {
    const { db } = makeDb();
    const row = await createShiftTemplate(
      ORG_ID,
      {
        name: 'משמרת לילה',
        startLocalTime: '23:00',
        endLocalTime: '07:00',
        requiredEmployeeCount: 3,
        roleId: ROLE_ID,
        locationId: LOC_ID,
        timezone: 'Asia/Jerusalem',
      },
      DEFAULT_TZ,
      db,
    );
    const expected: ShiftTemplateRow = {
      id: TPL_ID,
      name: 'משמרת לילה',
      startLocalTime: '23:00',
      endLocalTime: '07:00',
      requiredEmployeeCount: 3,
      crossesMidnight: true,
      locationId: LOC_ID,
      roleId: ROLE_ID,
      timezone: 'Asia/Jerusalem',
    };
    expect(row).toEqual(expected);
  });
});

describe('listShiftTemplates — scoping, ordering, mapping', () => {
  it('queries scoped to the org with start/name ordering', async () => {
    const { db, calls } = makeDb({ findManyReturns: [] });
    const rows = await listShiftTemplates(ORG_ID, db);
    expect(rows).toEqual([]);
    expect(calls.findMany[0]!.where).toEqual({ organizationId: ORG_ID });
    expect(calls.findMany[0]!.orderBy).toEqual([
      { startLocalTime: 'asc' },
      { name: 'asc' },
    ]);
  });

  it('maps multiple rows through toRow preserving fields', async () => {
    const rows = [
      rawRow({ id: 'a', name: 'A', startLocalTime: '06:00', endLocalTime: '14:00' }),
      rawRow({
        id: 'b',
        name: 'B',
        startLocalTime: '22:00',
        endLocalTime: '06:00',
        crossesMidnight: true,
        requiredEmployeeCount: 2,
        roleId: ROLE_ID,
      }),
    ];
    const { db } = makeDb({ findManyReturns: rows });
    const out = await listShiftTemplates(ORG_ID, db);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('a');
    expect(out[1]!.crossesMidnight).toBe(true);
    expect(out[1]!.requiredEmployeeCount).toBe(2);
    expect(out[1]!.roleId).toBe(ROLE_ID);
  });

  it.each([ORG_ID, OTHER_ORG_ID])('scopes findMany to org=%s', async (orgId) => {
    const { db, calls } = makeDb({ findManyReturns: [] });
    await listShiftTemplates(orgId, db);
    expect(calls.findMany[0]!.where).toEqual({ organizationId: orgId });
  });
});

describe('updateShiftTemplate — 404 when not found / cross-org', () => {
  it('throws HttpError 404 when findFirst returns null', async () => {
    const { db, calls } = makeDb({ findFirstReturns: null });
    await expect(
      updateShiftTemplate(ORG_ID, TPL_ID, { name: 'New' }, db),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    // Must not attempt an update after the miss.
    expect(calls.update).toHaveLength(0);
  });

  it('the 404 error is an HttpError instance', async () => {
    const { db } = makeDb({ findFirstReturns: null });
    let caught: unknown;
    try {
      await updateShiftTemplate(ORG_ID, TPL_ID, { name: 'New' }, db);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpError).message).toBe('Shift template not found');
  });

  it('findFirst is org-scoped (id + organizationId)', async () => {
    const { db, calls } = makeDb({ findFirstReturns: null });
    await expect(
      updateShiftTemplate(OTHER_ORG_ID, TPL_ID, { name: 'New' }, db),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.findFirst[0]!.where).toEqual({
      id: TPL_ID,
      organizationId: OTHER_ORG_ID,
    });
  });
});

describe('updateShiftTemplate — partial data construction', () => {
  it('name-only update sends only name (trimmed), no time/midnight keys', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(ORG_ID, TPL_ID, { name: '  Renamed  ' }, db);
    const data = calls.update[0]!.data;
    expect(data['name']).toBe('Renamed');
    expect('startLocalTime' in data).toBe(false);
    expect('endLocalTime' in data).toBe(false);
    expect('crossesMidnight' in data).toBe(false);
    expect('requiredEmployeeCount' in data).toBe(false);
    expect('roleId' in data).toBe(false);
    expect('locationId' in data).toBe(false);
    expect('timezone' in data).toBe(false);
  });

  it('recomputes crossesMidnight when only startLocalTime changes (end from existing)', async () => {
    // existing end = 16:00; new start = 18:00 ⇒ 16:00 <= 18:00 ⇒ crosses
    const { db, calls } = makeDb({
      findFirstReturns: rawRow({ startLocalTime: '08:00', endLocalTime: '16:00' }),
    });
    await updateShiftTemplate(ORG_ID, TPL_ID, { startLocalTime: '18:00' }, db);
    const data = calls.update[0]!.data;
    expect(data['startLocalTime']).toBe('18:00');
    expect(data['crossesMidnight']).toBe(true);
    expect('endLocalTime' in data).toBe(false);
  });

  it('recomputes crossesMidnight when only endLocalTime changes (start from existing)', async () => {
    // existing start = 08:00; new end = 20:00 ⇒ 20:00 <= 08:00 false ⇒ no cross
    const { db, calls } = makeDb({
      findFirstReturns: rawRow({ startLocalTime: '08:00', endLocalTime: '16:00' }),
    });
    await updateShiftTemplate(ORG_ID, TPL_ID, { endLocalTime: '20:00' }, db);
    const data = calls.update[0]!.data;
    expect(data['endLocalTime']).toBe('20:00');
    expect(data['crossesMidnight']).toBe(false);
    expect('startLocalTime' in data).toBe(false);
  });

  it('recomputes crossesMidnight when both times change to an overnight pair', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(
      ORG_ID,
      TPL_ID,
      { startLocalTime: '23:30', endLocalTime: '05:00' },
      db,
    );
    const data = calls.update[0]!.data;
    expect(data['startLocalTime']).toBe('23:30');
    expect(data['endLocalTime']).toBe('05:00');
    expect(data['crossesMidnight']).toBe(true);
  });

  it('does NOT touch crossesMidnight when neither time changes', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(ORG_ID, TPL_ID, { requiredEmployeeCount: 4 }, db);
    const data = calls.update[0]!.data;
    expect('crossesMidnight' in data).toBe(false);
    expect(data['requiredEmployeeCount']).toBe(4);
  });

  // crossesMidnight recompute matrix over partial start/end inputs.
  const recomputeCases: Array<{
    exStart: string;
    exEnd: string;
    inStart?: string;
    inEnd?: string;
    expected: boolean;
  }> = [
    { exStart: '08:00', exEnd: '16:00', inStart: '17:00', expected: true }, // end16 <= start17 ⇒ true
    { exStart: '08:00', exEnd: '16:00', inStart: '15:00', expected: false }, // 16<=15 false
    { exStart: '08:00', exEnd: '16:00', inEnd: '07:00', expected: true },    // 07<=08 true
    { exStart: '08:00', exEnd: '16:00', inEnd: '09:00', expected: false },   // 09<=08 false
    { exStart: '22:00', exEnd: '06:00', inStart: '05:00', expected: false }, // 06<=05 false
    { exStart: '22:00', exEnd: '06:00', inEnd: '23:00', expected: false },   // 23<=22 false
    { exStart: '10:00', exEnd: '10:00', inStart: '09:00', expected: false }, // 10<=09 false
    { exStart: '10:00', exEnd: '10:00', inEnd: '10:00', expected: true },    // 10<=10 true
  ];

  it.each(recomputeCases)(
    'recompute ex[$exStart-$exEnd] in[$inStart/$inEnd] ⇒ $expected',
    async ({ exStart, exEnd, inStart, inEnd, expected }) => {
      const { db, calls } = makeDb({
        findFirstReturns: rawRow({ startLocalTime: exStart, endLocalTime: exEnd }),
      });
      const input: Partial<ShiftTemplateInput> = {};
      if (inStart !== undefined) input.startLocalTime = inStart;
      if (inEnd !== undefined) input.endLocalTime = inEnd;
      await updateShiftTemplate(ORG_ID, TPL_ID, input, db);
      expect(calls.update[0]!.data['crossesMidnight']).toBe(expected);
    },
  );
});

describe('updateShiftTemplate — roleId / locationId / count branches', () => {
  it('explicit null roleId is sent as null', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow({ roleId: ROLE_ID }) });
    await updateShiftTemplate(ORG_ID, TPL_ID, { roleId: null }, db);
    expect('roleId' in calls.update[0]!.data).toBe(true);
    expect(calls.update[0]!.data['roleId']).toBeNull();
  });

  it('valid roleId is sent verbatim', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(ORG_ID, TPL_ID, { roleId: ROLE_ID }, db);
    expect(calls.update[0]!.data['roleId']).toBe(ROLE_ID);
  });

  it('explicit null locationId is sent as null', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow({ locationId: LOC_ID }) });
    await updateShiftTemplate(ORG_ID, TPL_ID, { locationId: null }, db);
    expect('locationId' in calls.update[0]!.data).toBe(true);
    expect(calls.update[0]!.data['locationId']).toBeNull();
  });

  it('valid locationId is sent verbatim', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(ORG_ID, TPL_ID, { locationId: LOC_ID }, db);
    expect(calls.update[0]!.data['locationId']).toBe(LOC_ID);
  });

  it.each([0, 1, 2, 7, 50])(
    'requiredEmployeeCount=%s is sent verbatim',
    async (count) => {
      const { db, calls } = makeDb({ findFirstReturns: rawRow() });
      await updateShiftTemplate(ORG_ID, TPL_ID, { requiredEmployeeCount: count }, db);
      expect(calls.update[0]!.data['requiredEmployeeCount']).toBe(count);
    },
  );

  it('timezone-only update sends timezone, nothing else', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(ORG_ID, TPL_ID, { timezone: 'UTC' }, db);
    const data = calls.update[0]!.data;
    expect(data['timezone']).toBe('UTC');
    expect('name' in data).toBe(false);
    expect('crossesMidnight' in data).toBe(false);
  });

  it('empty patch sends an empty data object', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await updateShiftTemplate(ORG_ID, TPL_ID, {}, db);
    expect(calls.update[0]!.data).toEqual({});
  });
});

describe('updateShiftTemplate — org-scoped update where clause', () => {
  it.each([ORG_ID, OTHER_ORG_ID])(
    'update() where carries id + organizationId=%s',
    async (orgId) => {
      const { db, calls } = makeDb({ findFirstReturns: rawRow() });
      await updateShiftTemplate(orgId, TPL_ID, { name: 'Z' }, db);
      expect(calls.update[0]!.where).toEqual({ id: TPL_ID, organizationId: orgId });
    },
  );
});

describe('deleteShiftTemplate', () => {
  it('throws HttpError 404 when template missing', async () => {
    const { db, calls } = makeDb({ findFirstReturns: null });
    await expect(deleteShiftTemplate(ORG_ID, TPL_ID, db)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(calls.delete).toHaveLength(0);
  });

  it('deletes with an org-scoped where when found', async () => {
    const { db, calls } = makeDb({ findFirstReturns: rawRow() });
    await deleteShiftTemplate(ORG_ID, TPL_ID, db);
    expect(calls.findFirst[0]!.where).toEqual({ id: TPL_ID, organizationId: ORG_ID });
    expect(calls.delete[0]!.where).toEqual({ id: TPL_ID, organizationId: ORG_ID });
  });

  it.each([ORG_ID, OTHER_ORG_ID])(
    'findFirst lookup is scoped to org=%s before delete',
    async (orgId) => {
      const { db, calls } = makeDb({ findFirstReturns: rawRow() });
      await deleteShiftTemplate(orgId, TPL_ID, db);
      expect(calls.findFirst[0]!.where).toEqual({ id: TPL_ID, organizationId: orgId });
    },
  );

  it('returns undefined on success', async () => {
    const { db } = makeDb({ findFirstReturns: rawRow() });
    const result = await deleteShiftTemplate(ORG_ID, TPL_ID, db);
    expect(result).toBeUndefined();
  });

  it('delete 404 is an HttpError with the expected message', async () => {
    const { db } = makeDb({ findFirstReturns: null });
    let caught: unknown;
    try {
      await deleteShiftTemplate(ORG_ID, TPL_ID, db);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpError).statusCode).toBe(404);
    expect((caught as HttpError).message).toBe('Shift template not found');
  });
});

describe('updateShiftTemplate — returns mapped row from update result', () => {
  it('maps the updated DB row through toRow', async () => {
    const updated = rawRow({
      id: TPL_ID,
      name: 'ערב',
      startLocalTime: '16:00',
      endLocalTime: '00:00',
      crossesMidnight: true,
      requiredEmployeeCount: 2,
      roleId: ROLE_ID,
      locationId: LOC_ID,
      timezone: 'Asia/Jerusalem',
    });
    const { db } = makeDb({ findFirstReturns: rawRow(), updateReturns: updated });
    const row = await updateShiftTemplate(
      ORG_ID,
      TPL_ID,
      { name: 'ערב', startLocalTime: '16:00', endLocalTime: '00:00' },
      db,
    );
    const expected: ShiftTemplateRow = {
      id: TPL_ID,
      name: 'ערב',
      startLocalTime: '16:00',
      endLocalTime: '00:00',
      requiredEmployeeCount: 2,
      crossesMidnight: true,
      locationId: LOC_ID,
      roleId: ROLE_ID,
      timezone: 'Asia/Jerusalem',
    };
    expect(row).toEqual(expected);
  });
});
