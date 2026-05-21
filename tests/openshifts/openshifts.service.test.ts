/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictError, NotFoundError } from '../../src/shared/errors';

// Mock shared deps before importing the service under test.
jest.mock('../../src/db/prisma', () => ({ prisma: {} }));
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

function makeShift(over: Partial<any> = {}) {
  return {
    id: 'shift-1',
    organizationId: 'org-1',
    scheduleId: 'sched-1',
    locationId: null,
    isOpenShift: true,
    version: 0,
    startAtUtc: new Date('2026-06-01T08:00:00Z'),
    endAtUtc: new Date('2026-06-01T16:00:00Z'),
    timezone: 'Asia/Jerusalem',
    organization: { laborRulesJsonb: {} },
    location: null,
    ...over,
  };
}

function fakeTx(overrides: Record<string, any>) {
  return {
    shift: { findUnique: jest.fn(), update: jest.fn() },
    employee: { findUnique: jest.fn().mockResolvedValue({ id: 'emp-1', roles: [] }) },
    employeeAvailabilityRule: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('openshifts.service.claimOpenShift', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when shift does not exist', async () => {
    const tx = fakeTx({});
    tx.shift.findUnique.mockResolvedValue(null);
    await expect(
      claimOpenShift(
        { shiftId: 'shift-1', employeeId: 'emp-1', acknowledgeWarnings: false, actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when shift is not an open shift', async () => {
    const tx = fakeTx({});
    tx.shift.findUnique.mockResolvedValue(makeShift({ isOpenShift: false }));
    await expect(
      claimOpenShift(
        { shiftId: 'shift-1', employeeId: 'emp-1', acknowledgeWarnings: false, actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SHIFT_NOT_OPEN' });
  });

  it('rejects when a pending claim already exists', async () => {
    const tx = fakeTx({});
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      claimOpenShift(
        { shiftId: 'shift-1', employeeId: 'emp-1', acknowledgeWarnings: false, actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates a claim on happy path', async () => {
    const tx = fakeTx({});
    tx.shift.findUnique.mockResolvedValue(makeShift());
    tx.openShiftClaim.create.mockResolvedValue({
      id: 'claim-1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    const out = await claimOpenShift(
      { shiftId: 'shift-1', employeeId: 'emp-1', acknowledgeWarnings: false, actingUserId: 'u' },
      makePrisma(tx),
    );
    expect(out.claim.id).toBe('claim-1');
    expect(out.outcome).toBe('allowed');
  });

  it('rejects with 422 when validation is blocked', async () => {
    (validateAssignment as jest.Mock).mockResolvedValueOnce({
      outcome: 'blocked',
      results: [],
      blocking: [{ ruleCode: 'X' }],
      warnings: [],
    });
    const tx = fakeTx({});
    tx.shift.findUnique.mockResolvedValue(makeShift());
    await expect(
      claimOpenShift(
        { shiftId: 'shift-1', employeeId: 'emp-1', acknowledgeWarnings: false, actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: 'CONSTRAINTS_VIOLATED' });
  });
});

describe('openshifts.service.approveClaim', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when claim missing', async () => {
    const tx = fakeTx({});
    tx.openShiftClaim.findUnique.mockResolvedValue(null);
    await expect(
      approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects approval on non-PENDING claim', async () => {
    const tx = fakeTx({});
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'APPROVED',
    });
    await expect(
      approveClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'CLAIM_WRONG_STATE' });
  });

  it('happy path approves claim, creates assignment, bumps shift version', async () => {
    const tx = fakeTx({});
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

    const out = await approveClaim(
      { claimId: 'c1', actingUserId: 'u' },
      makePrisma(tx),
    );

    expect(out.claim.status).toBe('APPROVED');
    expect(out.assignment.id).toBe('a1');
    expect(out.shift.version).toBe(1);
    expect(tx.shift.update).toHaveBeenCalled();
  });

  it('rejects on version mismatch', async () => {
    const tx = fakeTx({});
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      shiftId: 'shift-1',
      employeeId: 'emp-1',
      status: 'PENDING',
    });
    tx.shift.findUnique.mockResolvedValue(makeShift({ version: 3 }));
    await expect(
      approveClaim(
        { claimId: 'c1', actingUserId: 'u', expectedShiftVersion: 0 },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
  });
});

describe('openshifts.service.rejectClaim', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when claim missing', async () => {
    const tx = fakeTx({});
    tx.openShiftClaim.findUnique.mockResolvedValue(null);
    await expect(
      rejectClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects rejection on non-PENDING claim', async () => {
    const tx = fakeTx({});
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'APPROVED',
      shift: { organizationId: 'org-1', scheduleId: null },
    });
    await expect(
      rejectClaim({ claimId: 'c1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'CLAIM_WRONG_STATE' });
  });

  it('happy path sets status REJECTED', async () => {
    const tx = fakeTx({});
    tx.openShiftClaim.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'PENDING',
      shift: { organizationId: 'org-1', scheduleId: null },
    });
    tx.openShiftClaim.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });
    const out = await rejectClaim(
      { claimId: 'c1', actingUserId: 'u', reason: 'no' },
      makePrisma(tx),
    );
    expect(out.claim.status).toBe('REJECTED');
  });
});
