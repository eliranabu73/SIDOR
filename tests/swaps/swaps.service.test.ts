/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../../src/db/prisma', () => ({ prisma: {} }));
jest.mock('../../src/modules/audit/audit.service', () => ({
  writeAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/modules/events/events.service', () => ({
  writeEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
  approveSwap,
  createSwap,
  rejectSwap,
} from '../../src/modules/swaps/swaps.service';

function makeShift(over: Partial<any> = {}) {
  return {
    id: 'shift-1',
    organizationId: 'org-1',
    scheduleId: 'sched-1',
    version: 0,
    startAtUtc: new Date('2026-06-01T08:00:00Z'),
    endAtUtc: new Date('2026-06-01T16:00:00Z'),
    timezone: 'Asia/Jerusalem',
    ...over,
  };
}

function fakeTx(overrides: Record<string, any> = {}) {
  return {
    shift: { update: jest.fn().mockResolvedValue({ id: 'shift-1', version: 1 }) },
    shiftAssignment: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    shiftSwapRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employeeScheduleMetrics: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function makePrisma(tx: any) {
  return {
    $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
  } as any;
}

describe('swaps.service.createSwap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('404 when source assignment missing', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(null);
    await expect(
      createSwap(
        {
          sourceAssignmentId: 'a1',
          requestingEmployeeId: 'emp-1',
          targetEmployeeId: null,
          actingUserId: 'u',
        },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('403 SWAP_NOT_AUTHORIZED when requester does not own assignment', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue({
      id: 'a1',
      employeeId: 'emp-other',
      assignmentStatus: 'CONFIRMED',
      shiftId: 'shift-1',
      shift: makeShift(),
    });
    await expect(
      createSwap(
        {
          sourceAssignmentId: 'a1',
          requestingEmployeeId: 'emp-1',
          targetEmployeeId: null,
          actingUserId: 'u',
        },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED', statusCode: 403 });
  });

  it('happy path creates a PENDING swap', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue({
      id: 'a1',
      employeeId: 'emp-1',
      assignmentStatus: 'CONFIRMED',
      shiftId: 'shift-1',
      shift: makeShift(),
    });
    tx.shiftSwapRequest.create.mockResolvedValue({
      id: 'swap-1',
      status: 'PENDING',
      sourceAssignmentId: 'a1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: 'emp-2',
    });
    const out = await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: 'emp-2',
        actingUserId: 'u',
      },
      makePrisma(tx),
    );
    expect(out.swap.status).toBe('PENDING');
    expect(out.swap.targetEmployeeId).toBe('emp-2');
  });
});

describe('swaps.service.approveSwap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns SWAP_NOT_FOUND when missing', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(null);
    await expect(
      approveSwap({ swapId: 's1', actingUserId: 'u', asManager: false }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_FOUND', statusCode: 404 });
  });

  it('target approval transitions PENDING -> APPROVED_BY_TARGET', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'PENDING',
      organizationId: 'org-1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: 'emp-2',
      sourceAssignmentId: 'a1',
    });
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    const out = await approveSwap(
      {
        swapId: 's1',
        actingUserId: 'u',
        approvingEmployeeId: 'emp-2',
        asManager: false,
      },
      makePrisma(tx),
    );
    expect(out.swap.status).toBe('APPROVED_BY_TARGET');
  });

  it('target approval rejected when approver is not designated target', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'PENDING',
      organizationId: 'org-1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: 'emp-2',
      sourceAssignmentId: 'a1',
    });
    await expect(
      approveSwap(
        {
          swapId: 's1',
          actingUserId: 'u',
          approvingEmployeeId: 'emp-99',
          asManager: false,
        },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED' });
  });

  it('open-target swap pins the target on first target-approval', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'PENDING',
      organizationId: 'org-1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: null,
      sourceAssignmentId: 'a1',
    });
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    const out = await approveSwap(
      {
        swapId: 's1',
        actingUserId: 'u',
        approvingEmployeeId: 'emp-42',
        asManager: false,
      },
      makePrisma(tx),
    );
    expect(out.swap.status).toBe('APPROVED_BY_TARGET');
    expect(tx.shiftSwapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetEmployeeId: 'emp-42' }),
      }),
    );
  });

  it('manager approval requires APPROVED_BY_TARGET', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'PENDING',
      organizationId: 'org-1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: 'emp-2',
      sourceAssignmentId: 'a1',
    });
    await expect(
      approveSwap(
        { swapId: 's1', actingUserId: 'u', asManager: true },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE' });
  });

  it('manager approval executes the swap', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
      organizationId: 'org-1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: 'emp-2',
      sourceAssignmentId: 'a1',
    });
    tx.shiftAssignment.findUnique.mockResolvedValue({
      id: 'a1',
      employeeId: 'emp-1',
      assignmentStatus: 'CONFIRMED',
      shiftId: 'shift-1',
      shift: makeShift(),
    });
    tx.shiftAssignment.update.mockResolvedValue({ id: 'a1', version: 2 });
    tx.shiftAssignment.upsert.mockResolvedValue({
      id: 'a2',
      version: 1,
      assignmentStatus: 'CONFIRMED',
    });
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_MANAGER',
    });

    const out = await approveSwap(
      { swapId: 's1', actingUserId: 'u', asManager: true },
      makePrisma(tx),
    );

    expect(out.swap.status).toBe('APPROVED_BY_MANAGER');
    expect(out.assignment?.id).toBe('a2');
    expect(out.shift?.version).toBe(1);
    expect(tx.shiftAssignment.update).toHaveBeenCalled();
    expect(tx.shiftAssignment.upsert).toHaveBeenCalled();
  });
});

describe('swaps.service.rejectSwap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SWAP_NOT_FOUND when missing', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(null);
    await expect(
      rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_FOUND' });
  });

  it('rejects on terminal state', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_MANAGER',
      organizationId: 'org-1',
    });
    await expect(
      rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE' });
  });

  it('happy path', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue({
      id: 's1',
      status: 'PENDING',
      organizationId: 'org-1',
    });
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    const out = await rejectSwap(
      { swapId: 's1', actingUserId: 'u', reason: 'nope' },
      makePrisma(tx),
    );
    expect(out.swap.status).toBe('REJECTED');
  });
});
