/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Matrix / table-driven unit tests for openshifts.service.
 *
 * The service mocks the rules engine (validateAssignment), so eligibility
 * outcomes (role-match, time-off block, overlap) are driven by what the mocked
 * validateAssignment returns. We assert the SERVICE's reaction to each outcome:
 * - blocked   -> ValidationFailedError(CONSTRAINTS_VIOLATED, 422)
 * - allowed_with_warnings / allowed -> creates claim, warningsCount = warnings.length
 *
 * All dates are pinned to fixed calendar dates (no Date.now / no randomness in
 * expectations). Integer math only.
 */
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../src/shared/errors';

// --- Mock shared deps before importing the service under test. ---
jest.mock('../../src/db/prisma', () => ({
  prisma: {},
  ensureTx: <T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> =>
    db && typeof db.$transaction === 'function' ? db.$transaction(fn) : fn(db),
}));
jest.mock('../../src/modules/audit/audit.service', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/modules/events/events.service', () => ({
  writeEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/modules/locks/locks.service', () => ({
  LocksService: { peek: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../../src/modules/rules/snapshot.service', () => ({
  mergeRulesSnapshot: jest.fn().mockReturnValue({}),
  parseLaborRulesJson: jest.fn().mockReturnValue({}),
}));
jest.mock('../../src/modules/rules/validator.service', () => ({
  validateAssignment: jest.fn().mockResolvedValue({
    outcome: 'allowed',
    results: [],
    blocking: [],
    warnings: [],
  }),
  FAST_RULES: [],
}));

import {
  approveClaim,
  claimOpenShift,
  rejectClaim,
} from '../../src/modules/openshifts/openshifts.service';
import { validateAssignment } from '../../src/modules/rules/validator.service';
import { writeAudit } from '../../src/modules/audit/audit.service';
import { writeEvent, publishEvent } from '../../src/modules/events/events.service';

const validateMock = validateAssignment as jest.Mock;
const auditMock = writeAudit as jest.Mock;
const eventMock = writeEvent as jest.Mock;
const publishMock = publishEvent as jest.Mock;

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function makeShift(over: Partial<any> = {}) {
  return {
    id: 'shift-1',
    organizationId: 'org-1',
    scheduleId: 'sched-1',
    locationId: null,
    isOpenShift: true,
    version: 0,
    // Pinned: 2026-06-01 is a Monday. 08:00Z -> 11:00 Asia/Jerusalem (IDT, UTC+3).
    startAtUtc: new Date('2026-06-01T08:00:00Z'),
    endAtUtc: new Date('2026-06-01T16:00:00Z'),
    timezone: 'Asia/Jerusalem',
    organization: { laborRulesJsonb: {} },
    location: null,
    ...over,
  };
}

function fakeTx(overrides: Record<string, any> = {}) {
  return {
    shift: { findUnique: jest.fn(), update: jest.fn() },
    employee: {
      findUnique: jest.fn().mockResolvedValue({ id: 'emp-1', roles: [] }),
    },
    employeeAvailabilityRule: { findMany: jest.fn().mockResolvedValue([]) },
    employeeTimeOffRequest: { findMany: jest.fn().mockResolvedValue([]) },
    shiftAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    employeeScheduleMetrics: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    openShiftClaim: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ...overrides,
  };
}

function makePrisma(tx: any) {
  return {
    $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
  } as any;
}

function validation(over: Partial<any> = {}) {
  return {
    outcome: 'allowed' as const,
    results: [],
    blocking: [],
    warnings: [],
    ...over,
  };
}

function rule(code: string, severity: 'info' | 'warning' | 'blocking') {
  return {
    ruleCode: code,
    status: severity === 'info' ? ('passed' as const) : ('failed' as const),
    severity,
  };
}

const baseClaimInput = {
  shiftId: 'shift-1',
  employeeId: 'emp-1',
  acknowledgeWarnings: false,
  actingUserId: 'user-actor',
};

// ----------------------------------------------------------------------------
// claimOpenShift — guard matrix
// ----------------------------------------------------------------------------

describe('claimOpenShift — guard matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateMock.mockResolvedValue(validation());
  });

  const guardCases: Array<{
    name: string;
    shift: any;
    pending: any;
    errorType: any;
    code?: string;
  }> = [
    {
      name: 'missing shift -> NotFoundError',
      shift: null,
      pending: null,
      errorType: NotFoundError,
    },
    {
      name: 'shift not open -> SHIFT_NOT_OPEN conflict',
      shift: makeShift({ isOpenShift: false }),
      pending: null,
      errorType: ConflictError,
      code: 'SHIFT_NOT_OPEN',
    },
    {
      name: 'existing pending claim -> CLAIM_ALREADY_PENDING conflict',
      shift: makeShift(),
      pending: { id: 'claim-existing' },
      errorType: ConflictError,
      code: 'CLAIM_ALREADY_PENDING',
    },
  ];

  for (const c of guardCases) {
    it(c.name, async () => {
      const tx = fakeTx();
      tx.shift.findUnique.mockResolvedValue(c.shift);
      tx.openShiftClaim.findFirst.mockResolvedValue(c.pending);
      const p = claimOpenShift(baseClaimInput, makePrisma(tx));
      await expect(p).rejects.toBeInstanceOf(c.errorType);
      if (c.code) await expect(p).rejects.toMatchObject({ code: c.code });
      // Guard rejections never create a claim.
      expect(tx.openShiftClaim.create).not.toHaveBeenCalled();
    });
  }

  it('CLAIM_ALREADY_PENDING surfaces the existing claim id in details', async () => {
    const tx = fakeTx();
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.findFirst.mockResolvedValue({ id: 'claim-existing' });
    await expect(
      claimOpenShift(baseClaimInput, makePrisma(tx)),
    ).rejects.toMatchObject({
      code: 'CLAIM_ALREADY_PENDING',
      details: { claimId: 'claim-existing' },
    });
  });

  it('pending-claim lookup is scoped to PENDING status for this shift+employee', async () => {
    const tx = fakeTx();
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.create.mockResolvedValue({
      id: 'claim-1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    await claimOpenShift(baseClaimInput, makePrisma(tx));
    expect(tx.openShiftClaim.findFirst).toHaveBeenCalledWith({
      where: { shiftId: 'shift-1', employeeId: 'emp-1', status: 'PENDING' },
    });
  });
});

// ----------------------------------------------------------------------------
// claimOpenShift — eligibility/outcome matrix (driven by validateAssignment)
// ----------------------------------------------------------------------------

describe('claimOpenShift — validation outcome matrix', () => {
  beforeEach(() => jest.clearAllMocks());

  // Each row: the mocked engine result, and what the service should do.
  const outcomeCases: Array<{
    name: string;
    result: any;
    expectWarnings: number;
    expectOutcome: string;
  }> = [
    {
      name: 'allowed with no warnings -> warningsCount 0',
      result: validation({ outcome: 'allowed', warnings: [] }),
      expectWarnings: 0,
      expectOutcome: 'allowed',
    },
    {
      name: 'allowed_with_warnings, 1 warning -> warningsCount 1',
      result: validation({
        outcome: 'allowed_with_warnings',
        warnings: [rule('REST', 'warning')],
        results: [rule('REST', 'warning')],
      }),
      expectWarnings: 1,
      expectOutcome: 'allowed_with_warnings',
    },
    {
      name: 'allowed_with_warnings, 3 warnings -> warningsCount 3',
      result: validation({
        outcome: 'allowed_with_warnings',
        warnings: [
          rule('REST', 'warning'),
          rule('OVERTIME_DAILY', 'warning'),
          rule('OVERTIME_WEEKLY', 'warning'),
        ],
      }),
      expectWarnings: 3,
      expectOutcome: 'allowed_with_warnings',
    },
    {
      name: 'allowed with 5 warnings still passes -> warningsCount 5',
      result: validation({
        outcome: 'allowed_with_warnings',
        warnings: [
          rule('A', 'warning'),
          rule('B', 'warning'),
          rule('C', 'warning'),
          rule('D', 'warning'),
          rule('E', 'warning'),
        ],
      }),
      expectWarnings: 5,
      expectOutcome: 'allowed_with_warnings',
    },
  ];

  for (const c of outcomeCases) {
    it(c.name, async () => {
      validateMock.mockResolvedValueOnce(c.result);
      const tx = fakeTx();
      tx.shift.findUnique.mockResolvedValue(makeShift());
      tx.openShiftClaim.create.mockResolvedValue({
        id: 'claim-1',
        shiftId: 'shift-1',
        employeeId: 'emp-1',
        status: 'PENDING',
      });
      const out = await claimOpenShift(baseClaimInput, makePrisma(tx));
      expect(out.status).toBe('ok');
      expect(out.claim.warningsCount).toBe(c.expectWarnings);
      expect(out.outcome).toBe(c.expectOutcome);
      expect(out.claim.status).toBe('PENDING');
      expect(tx.openShiftClaim.create).toHaveBeenCalledTimes(1);
    });
  }

  // Blocked outcomes — each represents a different eligibility failure.
  const blockedCases: Array<{ name: string; blocking: any[] }> = [
    { name: 'role mismatch blocks', blocking: [rule('ROLE_MATCH', 'blocking')] },
    { name: 'approved time-off blocks', blocking: [rule('TIME_OFF', 'blocking')] },
    { name: 'overlapping assignment blocks', blocking: [rule('OVERLAP', 'blocking')] },
    {
      name: 'multiple blocking rules',
      blocking: [rule('ROLE_MATCH', 'blocking'), rule('OVERLAP', 'blocking')],
    },
  ];

  for (const c of blockedCases) {
    it(`${c.name} -> ValidationFailedError(422) and no claim created`, async () => {
      validateMock.mockResolvedValueOnce(
        validation({ outcome: 'blocked', blocking: c.blocking }),
      );
      const tx = fakeTx();
      tx.shift.findUnique.mockResolvedValue(makeShift());
      const p = claimOpenShift(baseClaimInput, makePrisma(tx));
      await expect(p).rejects.toBeInstanceOf(ValidationFailedError);
      await expect(p).rejects.toMatchObject({
        code: 'CONSTRAINTS_VIOLATED',
        statusCode: 422,
        details: { violations: c.blocking },
      });
      expect(tx.openShiftClaim.create).not.toHaveBeenCalled();
      expect(eventMock).not.toHaveBeenCalled();
    });
  }
});

// ----------------------------------------------------------------------------
// claimOpenShift — side effects (audit / event / publish)
// ----------------------------------------------------------------------------

describe('claimOpenShift — side effects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateMock.mockResolvedValue(validation());
  });

  function setupHappy(tx: any) {
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.create.mockResolvedValue({
      id: 'claim-77',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
  }

  it('writes a CREATE audit row for the OpenShiftClaim entity', async () => {
    const tx = fakeTx();
    setupHappy(tx);
    await claimOpenShift(baseClaimInput, makePrisma(tx));
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![1]).toMatchObject({
      organizationId: 'org-1',
      scheduleId: 'sched-1',
      userId: 'user-actor',
      actionType: 'CREATE',
      entityType: 'OpenShiftClaim',
      entityId: 'claim-77',
      before: null,
    });
  });

  it('writes an OPEN_SHIFT_CLAIMED event with shift+employee payload', async () => {
    const tx = fakeTx();
    setupHappy(tx);
    await claimOpenShift(baseClaimInput, makePrisma(tx));
    expect(eventMock).toHaveBeenCalledTimes(1);
    expect(eventMock.mock.calls[0]![1]).toMatchObject({
      organizationId: 'org-1',
      eventType: 'OPEN_SHIFT_CLAIMED',
      aggregateType: 'OpenShiftClaim',
      aggregateId: 'claim-77',
      payload: { shiftId: 'shift-1', employeeId: 'emp-1', warningsCount: 0 },
      userId: 'user-actor',
    });
  });

  it('publishes exactly once with the persisted event id', async () => {
    const tx = fakeTx();
    setupHappy(tx);
    await claimOpenShift(baseClaimInput, makePrisma(tx));
    // events mock returns { id: 'event-1' }
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0]![0]).toMatchObject({
      id: 'event-1',
      eventType: 'OPEN_SHIFT_CLAIMED',
      aggregateId: 'claim-77',
    });
  });

  it('audit "after" carries the computed warningsCount alongside the claim', async () => {
    validateMock.mockResolvedValueOnce(
      validation({
        outcome: 'allowed_with_warnings',
        warnings: [rule('REST', 'warning'), rule('OT', 'warning')],
      }),
    );
    const tx = fakeTx();
    setupHappy(tx);
    await claimOpenShift(baseClaimInput, makePrisma(tx));
    expect(auditMock.mock.calls[0]![1].after).toMatchObject({
      id: 'claim-77',
      status: 'PENDING',
      warningsCount: 2,
    });
  });

  it('does not write audit/event when validation blocks', async () => {
    validateMock.mockResolvedValueOnce(
      validation({ outcome: 'blocked', blocking: [rule('OVERLAP', 'blocking')] }),
    );
    const tx = fakeTx();
    tx.shift.findUnique.mockResolvedValue(makeShift());
    await expect(
      claimOpenShift(baseClaimInput, makePrisma(tx)),
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(auditMock).not.toHaveBeenCalled();
    expect(eventMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// approveClaim — state matrix
// ----------------------------------------------------------------------------

describe('approveClaim — claim state matrix', () => {
  beforeEach(() => jest.clearAllMocks());

  function pendingClaim() {
    return {
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    };
  }

  function setupApprove(tx: any, shiftOver: any = {}) {
    tx.openShiftClaim.findUnique.mockResolvedValue(pendingClaim());
    tx.shift.findUnique.mockResolvedValue(makeShift(shiftOver));
    tx.shiftAssignment.upsert.mockResolvedValue({
      id: 'a1',
      version: 1,
      assignmentStatus: 'CONFIRMED',
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });
    tx.shift.update.mockResolvedValue({ id: 'shift-1', version: 1 });
  }

  it('missing claim -> NotFoundError', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue(null);
    await expect(
      approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('missing shift -> NotFoundError', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue(pendingClaim());
    tx.shift.findUnique.mockResolvedValue(null);
    await expect(
      approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  // Non-PENDING states all reject with CLAIM_WRONG_STATE and echo currentStatus.
  const wrongStates = ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'];
  for (const st of wrongStates) {
    it(`status ${st} -> CLAIM_WRONG_STATE conflict (no assignment upsert)`, async () => {
      const tx = fakeTx();
      tx.openShiftClaim.findUnique.mockResolvedValue({
        id: 'c1',
        shiftId: 'shift-1',
        employeeId: 'emp-1',
        status: st,
      });
      const p = approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx));
      await expect(p).rejects.toBeInstanceOf(ConflictError);
      await expect(p).rejects.toMatchObject({
        code: 'CLAIM_WRONG_STATE',
        details: { currentStatus: st },
      });
      expect(tx.shiftAssignment.upsert).not.toHaveBeenCalled();
      expect(tx.shift.update).not.toHaveBeenCalled();
    });
  }

  it('happy path: confirms assignment, approves claim, bumps shift version', async () => {
    const tx = fakeTx();
    setupApprove(tx);
    const out = await approveClaim(
      { claimId: 'c1', actingUserId: 'manager-1' },
      makePrisma(tx),
    );
    expect(out.status).toBe('ok');
    expect(out.claim).toEqual({ id: 'c1', status: 'APPROVED' });
    expect(out.assignment).toEqual({
      id: 'a1',
      version: 1,
      status: 'CONFIRMED',
    });
    expect(out.shift).toEqual({ id: 'shift-1', version: 1 });
  });

  it('upsert is keyed by shiftId+employeeId with CONFIRMED/OPEN_SHIFT_CLAIM', async () => {
    const tx = fakeTx();
    setupApprove(tx);
    await approveClaim({ claimId: 'c1', actingUserId: 'manager-1' }, makePrisma(tx));
    const arg = tx.shiftAssignment.upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({
      shiftId_employeeId: { shiftId: 'shift-1', employeeId: 'emp-1' },
    });
    expect(arg.create).toMatchObject({
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      assignmentStatus: 'CONFIRMED',
      source: 'OPEN_SHIFT_CLAIM',
      assignedByUserId: 'manager-1',
    });
    expect(arg.update).toMatchObject({
      assignmentStatus: 'CONFIRMED',
      version: { increment: 1 },
    });
  });
});

// ----------------------------------------------------------------------------
// approveClaim — optimistic version matrix
// ----------------------------------------------------------------------------

describe('approveClaim — expectedShiftVersion matrix', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(tx: any, shiftVersion: number) {
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    tx.shift.findUnique.mockResolvedValue(makeShift({ version: shiftVersion }));
    tx.shiftAssignment.upsert.mockResolvedValue({
      id: 'a1',
      version: 1,
      assignmentStatus: 'CONFIRMED',
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });
    tx.shift.update.mockResolvedValue({ id: 'shift-1', version: shiftVersion + 1 });
  }

  const cases: Array<{
    name: string;
    shiftVersion: number;
    expected?: number;
    ok: boolean;
  }> = [
    { name: 'no expectedVersion -> skips check (ok)', shiftVersion: 5, ok: true },
    { name: 'expected matches (0==0)', shiftVersion: 0, expected: 0, ok: true },
    { name: 'expected matches (7==7)', shiftVersion: 7, expected: 7, ok: true },
    { name: 'expected too low (current 3, expected 0)', shiftVersion: 3, expected: 0, ok: false },
    { name: 'expected too high (current 2, expected 9)', shiftVersion: 2, expected: 9, ok: false },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const tx = fakeTx();
      setup(tx, c.shiftVersion);
      const input = {
        claimId: 'c1',
        actingUserId: 'u',
        ...(c.expected !== undefined ? { expectedShiftVersion: c.expected } : {}),
      };
      if (c.ok) {
        const out = await approveClaim(input, makePrisma(tx));
        expect(out.status).toBe('ok');
        expect(out.shift.version).toBe(c.shiftVersion + 1);
      } else {
        const p = approveClaim(input, makePrisma(tx));
        await expect(p).rejects.toMatchObject({
          code: 'VERSION_MISMATCH',
          details: { current: c.shiftVersion, expected: c.expected },
        });
        expect(tx.shiftAssignment.upsert).not.toHaveBeenCalled();
      }
    });
  }

  it('expectedShiftVersion 0 with current 0 is treated as a real check (not skipped)', async () => {
    // 0 is falsy but typeof === number, so the check must run and pass here.
    const tx = fakeTx();
    setup(tx, 0);
    const out = await approveClaim(
      { claimId: 'c1', actingUserId: 'u', expectedShiftVersion: 0 },
      makePrisma(tx),
    );
    expect(out.status).toBe('ok');
    expect(tx.shiftAssignment.upsert).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------------------
// approveClaim — metrics delta (classification + minutes) matrix
// ----------------------------------------------------------------------------

describe('approveClaim — metrics delta math', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(tx: any, shift: any) {
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    tx.shift.findUnique.mockResolvedValue(shift);
    tx.shiftAssignment.upsert.mockResolvedValue({
      id: 'a1',
      version: 1,
      assignmentStatus: 'CONFIRMED',
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });
    tx.shift.update.mockResolvedValue({ id: 'shift-1', version: 1 });
  }

  // Asia/Jerusalem in June is IDT (UTC+3). Hand-computed local start hours.
  // weekday->dayOfWeek: Sun=0..Sat=6; weekend = Fri(5)/Sat(6)/Sun(0).
  const cases: Array<{
    name: string;
    startUtc: string;
    endUtc: string;
    minutes: number;
    isMorning: boolean;
    isEvening: boolean;
    isNight: boolean;
    isWeekend: boolean;
  }> = [
    {
      // 08:00Z -> 11:00 local (Mon 2026-06-01) : morning, weekday
      name: 'morning weekday 8h',
      startUtc: '2026-06-01T08:00:00Z',
      endUtc: '2026-06-01T16:00:00Z',
      minutes: 480,
      isMorning: true,
      isEvening: false,
      isNight: false,
      isWeekend: false,
    },
    {
      // 13:00Z -> 16:00 local (Mon) : evening (12<=h<22), weekday
      name: 'evening weekday 6h',
      startUtc: '2026-06-01T13:00:00Z',
      endUtc: '2026-06-01T19:00:00Z',
      minutes: 360,
      isMorning: false,
      isEvening: true,
      isNight: false,
      isWeekend: false,
    },
    {
      // 21:00Z -> 00:00 local next day (2026-06-02 00:00 local) : hour 0 -> night
      name: 'night weekday (local hour 0)',
      startUtc: '2026-06-01T21:00:00Z',
      endUtc: '2026-06-02T05:00:00Z',
      minutes: 480,
      isMorning: false,
      isEvening: false,
      isNight: true,
      isWeekend: false,
    },
    {
      // 2026-06-05 is Friday. 07:00Z -> 10:00 local Fri : morning + weekend
      name: 'friday morning weekend',
      startUtc: '2026-06-05T07:00:00Z',
      endUtc: '2026-06-05T15:30:00Z',
      minutes: 510,
      isMorning: true,
      isEvening: false,
      isNight: false,
      isWeekend: true,
    },
    {
      // 2026-06-06 is Saturday. 15:00Z -> 18:00 local Sat : evening + weekend
      name: 'saturday evening weekend',
      startUtc: '2026-06-06T15:00:00Z',
      endUtc: '2026-06-06T20:00:00Z',
      minutes: 300,
      isMorning: false,
      isEvening: true,
      isNight: false,
      isWeekend: true,
    },
  ];

  for (const c of cases) {
    it(`${c.name}: minutes=${c.minutes} buckets correct`, async () => {
      const tx = fakeTx();
      setup(
        tx,
        makeShift({
          startAtUtc: new Date(c.startUtc),
          endAtUtc: new Date(c.endUtc),
        }),
      );
      await approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx));
      const arg = tx.employeeScheduleMetrics.upsert.mock.calls[0]![0];
      // create branch values (fresh week, findUnique returned null)
      expect(arg.create.totalScheduledMinutes).toBe(c.minutes);
      expect(arg.create.totalPaidMinutes).toBe(c.minutes);
      expect(arg.create.shiftCount).toBe(1);
      expect(arg.create.morningShiftCount).toBe(c.isMorning ? 1 : 0);
      expect(arg.create.eveningShiftCount).toBe(c.isEvening ? 1 : 0);
      expect(arg.create.nightShiftCount).toBe(c.isNight ? 1 : 0);
      expect(arg.create.weekendShiftCount).toBe(c.isWeekend ? 1 : 0);
      // update branch increments
      expect(arg.update.totalScheduledMinutes).toEqual({ increment: c.minutes });
      expect(arg.update.shiftCount).toEqual({ increment: 1 });
    });
  }

  it('non-bucket flags emit undefined increments (not zero) on update branch', async () => {
    const tx = fakeTx();
    // morning weekday: evening/night/weekend should be undefined on update
    setup(tx, makeShift());
    await approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx));
    const arg = tx.employeeScheduleMetrics.upsert.mock.calls[0]![0];
    expect(arg.update.morningShiftCount).toEqual({ increment: 1 });
    expect(arg.update.eveningShiftCount).toBeUndefined();
    expect(arg.update.nightShiftCount).toBeUndefined();
    expect(arg.update.weekendShiftCount).toBeUndefined();
  });

  it('metrics upsert is keyed by employeeId+weekStartDate', async () => {
    const tx = fakeTx();
    setup(tx, makeShift());
    await approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx));
    const arg = tx.employeeScheduleMetrics.upsert.mock.calls[0]![0];
    expect(arg.where.employeeId_weekStartDate.employeeId).toBe('emp-1');
    expect(arg.where.employeeId_weekStartDate.weekStartDate).toBeInstanceOf(Date);
  });

  it('metrics carry organization + schedule ids from the shift', async () => {
    const tx = fakeTx();
    setup(tx, makeShift({ organizationId: 'org-9', scheduleId: 'sched-9' }));
    await approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx));
    const arg = tx.employeeScheduleMetrics.upsert.mock.calls[0]![0];
    expect(arg.create.organizationId).toBe('org-9');
    expect(arg.create.scheduleId).toBe('sched-9');
  });
});

// ----------------------------------------------------------------------------
// approveClaim — side effects (audit/event/publish)
// ----------------------------------------------------------------------------

describe('approveClaim — side effects', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(tx: any) {
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.shiftAssignment.upsert.mockResolvedValue({
      id: 'a1',
      version: 1,
      assignmentStatus: 'CONFIRMED',
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });
    tx.shift.update.mockResolvedValue({ id: 'shift-1', version: 1 });
  }

  it('writes an ASSIGN audit row with before=claim/after=updatedClaim', async () => {
    const tx = fakeTx();
    setup(tx);
    await approveClaim({ claimId: 'c1', actingUserId: 'mgr' }, makePrisma(tx));
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![1]).toMatchObject({
      actionType: 'ASSIGN',
      entityType: 'OpenShiftClaim',
      entityId: 'c1',
      userId: 'mgr',
      after: { id: 'c1', status: 'APPROVED' },
    });
  });

  it('writes OPEN_SHIFT_APPROVED event carrying the assignment id', async () => {
    const tx = fakeTx();
    setup(tx);
    await approveClaim({ claimId: 'c1', actingUserId: 'mgr' }, makePrisma(tx));
    expect(eventMock.mock.calls[0]![1]).toMatchObject({
      eventType: 'OPEN_SHIFT_APPROVED',
      aggregateId: 'c1',
      payload: { shiftId: 'shift-1', employeeId: 'emp-1', assignmentId: 'a1' },
    });
  });

  it('publishes once with the persisted event id after commit', async () => {
    const tx = fakeTx();
    setup(tx);
    await approveClaim({ claimId: 'c1', actingUserId: 'mgr' }, makePrisma(tx));
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0]![0]).toMatchObject({
      id: 'event-1',
      eventType: 'OPEN_SHIFT_APPROVED',
    });
  });

  it('updates claim status to APPROVED with approvedByUserId set', async () => {
    const tx = fakeTx();
    setup(tx);
    await approveClaim({ claimId: 'c1', actingUserId: 'mgr-2' }, makePrisma(tx));
    expect(tx.openShiftClaim.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'c1' },
      data: { status: 'APPROVED', approvedByUserId: 'mgr-2' },
    });
  });

  it('bumps shift version via increment', async () => {
    const tx = fakeTx();
    setup(tx);
    await approveClaim({ claimId: 'c1', actingUserId: 'mgr' }, makePrisma(tx));
    expect(tx.shift.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'shift-1' },
      data: { version: { increment: 1 } },
    });
  });
});

// ----------------------------------------------------------------------------
// rejectClaim — state matrix & idempotency
// ----------------------------------------------------------------------------

describe('rejectClaim — state matrix', () => {
  beforeEach(() => jest.clearAllMocks());

  it('missing claim -> NotFoundError', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue(null);
    await expect(
      rejectClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  const wrongStates = ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'];
  for (const st of wrongStates) {
    it(`status ${st} -> CLAIM_WRONG_STATE (no update)`, async () => {
      const tx = fakeTx();
      tx.openShiftClaim.findUnique.mockResolvedValue({
        id: 'c1',
        status: st,
        shift: { organizationId: 'org-1', scheduleId: null },
      });
      const p = rejectClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx));
      await expect(p).rejects.toBeInstanceOf(ConflictError);
      await expect(p).rejects.toMatchObject({
        code: 'CLAIM_WRONG_STATE',
        details: { currentStatus: st },
      });
      expect(tx.openShiftClaim.update).not.toHaveBeenCalled();
    });
  }

  it('happy path: PENDING -> REJECTED with approvedByUserId', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'PENDING',
      shift: { organizationId: 'org-1', scheduleId: 'sched-1' },
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });
    const out = await rejectClaim(
      { claimId: 'c1', actingUserId: 'mgr', reason: 'overstaffed' },
      makePrisma(tx),
    );
    expect(out).toEqual({ status: 'ok', claim: { id: 'c1', status: 'REJECTED' } });
    expect(tx.openShiftClaim.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'c1' },
      data: { status: 'REJECTED', approvedByUserId: 'mgr' },
    });
  });

  it('writes UPDATE audit with reason captured in after payload', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'PENDING',
      shift: { organizationId: 'org-2', scheduleId: null },
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });
    await rejectClaim(
      { claimId: 'c1', actingUserId: 'mgr', reason: 'overstaffed' },
      makePrisma(tx),
    );
    expect(auditMock.mock.calls[0]![1]).toMatchObject({
      organizationId: 'org-2',
      actionType: 'UPDATE',
      entityType: 'OpenShiftClaim',
      entityId: 'c1',
    });
    expect((auditMock.mock.calls[0]![1].after as any).reason).toBe('overstaffed');
  });

  it('omitted reason is recorded as null in audit after payload', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'PENDING',
      shift: { organizationId: 'org-1', scheduleId: null },
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });
    await rejectClaim({ claimId: 'c1', actingUserId: 'mgr' }, makePrisma(tx));
    expect((auditMock.mock.calls[0]![1].after as any).reason).toBeNull();
  });

  it('does NOT publish an event on rejection', async () => {
    const tx = fakeTx();
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'PENDING',
      shift: { organizationId: 'org-1', scheduleId: null },
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });
    await rejectClaim({ claimId: 'c1', actingUserId: 'mgr' }, makePrisma(tx));
    expect(eventMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Cross-cutting: transactional integrity / idempotency
// ----------------------------------------------------------------------------

describe('openshifts — transactional integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateMock.mockResolvedValue(validation());
  });

  it('claim runs inside ensureTx ($transaction invoked exactly once)', async () => {
    const tx = fakeTx();
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.create.mockResolvedValue({
      id: 'claim-1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    const txnSpy = jest.fn(async (fn: any) => fn(tx));
    await claimOpenShift(baseClaimInput, { $transaction: txnSpy } as any);
    expect(txnSpy).toHaveBeenCalledTimes(1);
  });

  it('re-claiming an already-pending shift is idempotently rejected (no second create)', async () => {
    const tx = fakeTx();
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.findFirst.mockResolvedValue({ id: 'claim-existing' });
    await expect(
      claimOpenShift(baseClaimInput, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'CLAIM_ALREADY_PENDING' });
    expect(tx.openShiftClaim.create).not.toHaveBeenCalled();
    expect(tx.openShiftClaim.update).not.toHaveBeenCalled();
  });

  it('approving twice: second call sees APPROVED state and is rejected', async () => {
    // First approval succeeds.
    const tx1 = fakeTx();
    tx1.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    tx1.shift.findUnique.mockResolvedValue(makeShift());
    tx1.shiftAssignment.upsert.mockResolvedValue({
      id: 'a1',
      version: 1,
      assignmentStatus: 'CONFIRMED',
    });
    tx1.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });
    tx1.shift.update.mockResolvedValue({ id: 'shift-1', version: 1 });
    const first = await approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx1));
    expect(first.claim.status).toBe('APPROVED');

    // Second approval: claim now APPROVED -> rejected, no further assignment.
    const tx2 = fakeTx();
    tx2.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'APPROVED',
    });
    await expect(
      approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx2)),
    ).rejects.toMatchObject({ code: 'CLAIM_WRONG_STATE' });
    expect(tx2.shiftAssignment.upsert).not.toHaveBeenCalled();
  });
});
