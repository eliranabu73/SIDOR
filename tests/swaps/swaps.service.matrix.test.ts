/* eslint-disable @typescript-eslint/no-explicit-any */
// Matrix-style deterministic unit tests for the swap lifecycle service.
// Mirrors the mock pattern in swaps.service.test.ts (sibling). All db access is
// faked; no real DB/network. Every date expectation is pinned to a fixed
// calendar date so classification/metrics math is hand-computable.

jest.mock('../../src/db/prisma', () => ({
  prisma: {},
  ensureTx: <T,>(db: any, fn: (tx: any) => Promise<T>): Promise<T> =>
    db && typeof db.$transaction === 'function' ? db.$transaction(fn) : fn(db),
}));
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
import { writeAudit } from '../../src/modules/audit/audit.service';
import { writeEvent, publishEvent } from '../../src/modules/events/events.service';

const writeAuditMock = writeAudit as unknown as jest.Mock;
const writeEventMock = writeEvent as unknown as jest.Mock;
const publishEventMock = publishEvent as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures / fakes
// ---------------------------------------------------------------------------

// FIXED calendar anchor: 2026-06-01T08:00:00Z.
// In Asia/Jerusalem (UTC+3 on this date, IDT) local = 2026-06-01 11:00, which is
// Monday => weekday, morning (06<=11<12), not night, not evening, not weekend.
// Duration 08:00Z -> 16:00Z = 8h = 480 minutes.
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
    shift: {
      update: jest.fn().mockResolvedValue({ id: 'shift-1', version: 1 }),
    },
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

// Pre-built mock factories for common assignment / swap rows.
function confirmedAssignment(over: Partial<any> = {}) {
  return {
    id: 'a1',
    employeeId: 'emp-1',
    assignmentStatus: 'CONFIRMED',
    shiftId: 'shift-1',
    shift: makeShift(),
    ...over,
  };
}

function pendingSwap(over: Partial<any> = {}) {
  return {
    id: 's1',
    status: 'PENDING',
    organizationId: 'org-1',
    requestingEmployeeId: 'emp-1',
    targetEmployeeId: 'emp-2',
    sourceAssignmentId: 'a1',
    ...over,
  };
}

// Wire up the full happy-path manager-finalization tx.
function managerFinalizeTx(over: { swap?: any; assignment?: any } = {}) {
  const tx = fakeTx();
  tx.shiftSwapRequest.findUnique.mockResolvedValue(
    over.swap ?? pendingSwap({ status: 'APPROVED_BY_TARGET' }),
  );
  tx.shiftAssignment.findUnique.mockResolvedValue(
    over.assignment ?? confirmedAssignment(),
  );
  tx.shiftAssignment.update.mockResolvedValue({ id: 'a1', version: 2 });
  tx.shiftAssignment.upsert.mockResolvedValue({
    id: 'a2',
    version: 1,
    assignmentStatus: 'CONFIRMED',
  });
  tx.shift.update.mockResolvedValue({ id: 'shift-1', version: 1 });
  tx.shiftSwapRequest.update.mockResolvedValue({
    id: 's1',
    status: 'APPROVED_BY_MANAGER',
  });
  return tx;
}

beforeEach(() => jest.clearAllMocks());

// ===========================================================================
// createSwap — validation & ownership
// ===========================================================================

describe('createSwap: validation matrix', () => {
  it('404 NotFound when source assignment missing', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(null);
    await expect(
      createSwap(
        { sourceAssignmentId: 'a1', requestingEmployeeId: 'emp-1', actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not create a swap row when assignment missing', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(null);
    await expect(
      createSwap(
        { sourceAssignmentId: 'a1', requestingEmployeeId: 'emp-1', actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toBeDefined();
    expect(tx.shiftSwapRequest.create).not.toHaveBeenCalled();
  });

  it('403 SWAP_NOT_AUTHORIZED when requester does not own assignment', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(
      confirmedAssignment({ employeeId: 'emp-other' }),
    );
    await expect(
      createSwap(
        { sourceAssignmentId: 'a1', requestingEmployeeId: 'emp-1', actingUserId: 'u' },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED', statusCode: 403 });
  });

  // assignmentStatus other than CONFIRMED -> SWAP_INVALID_SOURCE 409
  const nonConfirmedStates = [
    'PENDING',
    'CANCELLED',
    'DECLINED',
    'PROPOSED',
    'TENTATIVE',
    'COMPLETED',
  ];
  it.each(nonConfirmedStates)(
    'SWAP_INVALID_SOURCE (409) when source assignment is %s',
    async (state) => {
      const tx = fakeTx();
      tx.shiftAssignment.findUnique.mockResolvedValue(
        confirmedAssignment({ assignmentStatus: state }),
      );
      await expect(
        createSwap(
          { sourceAssignmentId: 'a1', requestingEmployeeId: 'emp-1', actingUserId: 'u' },
          makePrisma(tx),
        ),
      ).rejects.toMatchObject({
        code: 'SWAP_INVALID_SOURCE',
        statusCode: 409,
        details: { currentStatus: state },
      });
    },
  );

  it('SWAP_INVALID_TARGET (409) when target equals requester', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(confirmedAssignment());
    await expect(
      createSwap(
        {
          sourceAssignmentId: 'a1',
          requestingEmployeeId: 'emp-1',
          targetEmployeeId: 'emp-1',
          actingUserId: 'u',
        },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_INVALID_TARGET', statusCode: 409 });
  });

  it('self-target check does not fire for a null target', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(confirmedAssignment());
    tx.shiftSwapRequest.create.mockResolvedValue({
      id: 'swap-1',
      status: 'PENDING',
      sourceAssignmentId: 'a1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: null,
    });
    const out = await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: null,
        actingUserId: 'u',
      },
      makePrisma(tx),
    );
    expect(out.swap.targetEmployeeId).toBeNull();
  });
});

describe('createSwap: success matrix', () => {
  function wireCreate(tx: any, targetEmployeeId: string | null) {
    tx.shiftAssignment.findUnique.mockResolvedValue(confirmedAssignment());
    tx.shiftSwapRequest.create.mockResolvedValue({
      id: 'swap-1',
      status: 'PENDING',
      sourceAssignmentId: 'a1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId,
    });
  }

  it('creates a PENDING swap with a directed target', async () => {
    const tx = fakeTx();
    wireCreate(tx, 'emp-2');
    const out = await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: 'emp-2',
        actingUserId: 'u',
      },
      makePrisma(tx),
    );
    expect(out.status).toBe('ok');
    expect(out.swap.status).toBe('PENDING');
    expect(out.swap.targetEmployeeId).toBe('emp-2');
    expect(out.swap.sourceAssignmentId).toBe('a1');
    expect(out.swap.requestingEmployeeId).toBe('emp-1');
  });

  it('passes status PENDING into the create() data payload', async () => {
    const tx = fakeTx();
    wireCreate(tx, 'emp-2');
    await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: 'emp-2',
        actingUserId: 'u',
      },
      makePrisma(tx),
    );
    expect(tx.shiftSwapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          organizationId: 'org-1',
          sourceAssignmentId: 'a1',
          requestingEmployeeId: 'emp-1',
          targetEmployeeId: 'emp-2',
        }),
      }),
    );
  });

  it('normalizes undefined target to null in create() data', async () => {
    const tx = fakeTx();
    wireCreate(tx, null);
    await createSwap(
      { sourceAssignmentId: 'a1', requestingEmployeeId: 'emp-1', actingUserId: 'u' },
      makePrisma(tx),
    );
    expect(tx.shiftSwapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetEmployeeId: null }),
      }),
    );
  });

  it('writes a CREATE audit entry for ShiftSwapRequest', async () => {
    const tx = fakeTx();
    wireCreate(tx, 'emp-2');
    await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: 'emp-2',
        actingUserId: 'mgr',
      },
      makePrisma(tx),
    );
    expect(writeAuditMock).toHaveBeenCalledTimes(1);
    expect(writeAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actionType: 'CREATE',
        entityType: 'ShiftSwapRequest',
        entityId: 'swap-1',
        userId: 'mgr',
        before: null,
      }),
    );
  });

  it('writes a SWAP_REQUESTED event with shift + employee payload', async () => {
    const tx = fakeTx();
    wireCreate(tx, 'emp-2');
    await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: 'emp-2',
        actingUserId: 'u',
      },
      makePrisma(tx),
    );
    expect(writeEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'SWAP_REQUESTED',
        aggregateType: 'ShiftSwapRequest',
        aggregateId: 'swap-1',
        payload: expect.objectContaining({
          sourceAssignmentId: 'a1',
          shiftId: 'shift-1',
          requestingEmployeeId: 'emp-1',
          targetEmployeeId: 'emp-2',
        }),
      }),
    );
  });

  it('publishes SWAP_REQUESTED with the event id after commit', async () => {
    const tx = fakeTx();
    wireCreate(tx, 'emp-2');
    await createSwap(
      {
        sourceAssignmentId: 'a1',
        requestingEmployeeId: 'emp-1',
        targetEmployeeId: 'emp-2',
        actingUserId: 'u',
      },
      makePrisma(tx),
    );
    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(publishEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        eventType: 'SWAP_REQUESTED',
        organizationId: 'org-1',
        aggregateId: 'swap-1',
      }),
    );
  });

  it('uses the shift organizationId from the assignment include', async () => {
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(
      confirmedAssignment({ shift: makeShift({ organizationId: 'org-XYZ' }) }),
    );
    tx.shiftSwapRequest.create.mockResolvedValue({
      id: 'swap-1',
      status: 'PENDING',
      sourceAssignmentId: 'a1',
      requestingEmployeeId: 'emp-1',
      targetEmployeeId: null,
    });
    await createSwap(
      { sourceAssignmentId: 'a1', requestingEmployeeId: 'emp-1', actingUserId: 'u' },
      makePrisma(tx),
    );
    expect(tx.shiftSwapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-XYZ' }),
      }),
    );
  });

  it('works without a $transaction wrapper (direct Db fallback via ensureTx)', async () => {
    // ensureTx falls back to fn(db) when db has no $transaction.
    const tx = fakeTx();
    tx.shiftAssignment.findUnique.mockResolvedValue(confirmedAssignment());
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
      tx as any,
    );
    expect(out.swap.status).toBe('PENDING');
  });
});

// ===========================================================================
// approveSwap — target-employee approval branch
// ===========================================================================

describe('approveSwap: target approval matrix', () => {
  it('404 SWAP_NOT_FOUND when swap missing', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(null);
    await expect(
      approveSwap({ swapId: 's1', actingUserId: 'u', asManager: false }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_FOUND', statusCode: 404 });
  });

  // Only PENDING can receive target approval; everything else is SWAP_WRONG_STATE.
  const nonPendingStates = [
    'APPROVED_BY_TARGET',
    'APPROVED_BY_MANAGER',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ];
  it.each(nonPendingStates)(
    'SWAP_WRONG_STATE when target-approving a swap in %s',
    async (state) => {
      const tx = fakeTx();
      tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap({ status: state }));
      await expect(
        approveSwap(
          {
            swapId: 's1',
            actingUserId: 'u',
            approvingEmployeeId: 'emp-2',
            asManager: false,
          },
          makePrisma(tx),
        ),
      ).rejects.toMatchObject({
        code: 'SWAP_WRONG_STATE',
        statusCode: 409,
        details: { currentStatus: state },
      });
    },
  );

  it('SWAP_NOT_AUTHORIZED when approvingEmployeeId is absent', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    await expect(
      approveSwap({ swapId: 's1', actingUserId: 'u', asManager: false }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED', statusCode: 403 });
  });

  it('SWAP_NOT_AUTHORIZED when requester approves their own swap (self-swap)', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ requestingEmployeeId: 'emp-1', targetEmployeeId: null }),
    );
    await expect(
      approveSwap(
        {
          swapId: 's1',
          actingUserId: 'u',
          approvingEmployeeId: 'emp-1',
          asManager: false,
        },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED', statusCode: 403 });
  });

  it('SWAP_NOT_AUTHORIZED when approver is not the designated target', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ targetEmployeeId: 'emp-2' }),
    );
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
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED', statusCode: 403 });
  });

  it('transitions PENDING -> APPROVED_BY_TARGET for the designated target', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ targetEmployeeId: 'emp-2' }),
    );
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
    expect(out.status).toBe('ok');
    expect(out.swap.status).toBe('APPROVED_BY_TARGET');
    expect(out.assignment).toBeUndefined();
    expect(out.shift).toBeUndefined();
  });

  it('pins the target on an open-target swap at first approval', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ targetEmployeeId: null }),
    );
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    await approveSwap(
      {
        swapId: 's1',
        actingUserId: 'u',
        approvingEmployeeId: 'emp-42',
        asManager: false,
      },
      makePrisma(tx),
    );
    expect(tx.shiftSwapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({
          status: 'APPROVED_BY_TARGET',
          targetEmployeeId: 'emp-42',
        }),
      }),
    );
  });

  it('open-target swap cannot be self-approved by the requester', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ requestingEmployeeId: 'emp-7', targetEmployeeId: null }),
    );
    await expect(
      approveSwap(
        {
          swapId: 's1',
          actingUserId: 'u',
          approvingEmployeeId: 'emp-7',
          asManager: false,
        },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_AUTHORIZED' });
  });

  it('writes an UPDATE audit on target approval (no domain event)', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    await approveSwap(
      {
        swapId: 's1',
        actingUserId: 'u',
        approvingEmployeeId: 'emp-2',
        asManager: false,
      },
      makePrisma(tx),
    );
    expect(writeAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actionType: 'UPDATE',
        entityType: 'ShiftSwapRequest',
        entityId: 's1',
      }),
    );
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it('does NOT publish any event on target approval', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    await approveSwap(
      {
        swapId: 's1',
        actingUserId: 'u',
        approvingEmployeeId: 'emp-2',
        asManager: false,
      },
      makePrisma(tx),
    );
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it('does not assign or cancel any assignment during target approval', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    await approveSwap(
      {
        swapId: 's1',
        actingUserId: 'u',
        approvingEmployeeId: 'emp-2',
        asManager: false,
      },
      makePrisma(tx),
    );
    expect(tx.shiftAssignment.update).not.toHaveBeenCalled();
    expect(tx.shiftAssignment.upsert).not.toHaveBeenCalled();
    expect(tx.employeeScheduleMetrics.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// approveSwap — manager finalization branch
// ===========================================================================

describe('approveSwap: manager finalization gate matrix', () => {
  // Manager finalize requires exactly APPROVED_BY_TARGET.
  const wrongStatesForManager = [
    'PENDING',
    'APPROVED_BY_MANAGER',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ];
  it.each(wrongStatesForManager)(
    'SWAP_WRONG_STATE when manager finalizes a swap in %s',
    async (state) => {
      const tx = fakeTx();
      tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap({ status: state }));
      await expect(
        approveSwap({ swapId: 's1', actingUserId: 'u', asManager: true }, makePrisma(tx)),
      ).rejects.toMatchObject({
        code: 'SWAP_WRONG_STATE',
        statusCode: 409,
        details: { currentStatus: state },
      });
    },
  );

  it('SWAP_WRONG_STATE when APPROVED_BY_TARGET swap has no target employee', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: 'APPROVED_BY_TARGET', targetEmployeeId: null }),
    );
    await expect(
      approveSwap({ swapId: 's1', actingUserId: 'u', asManager: true }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE', statusCode: 409 });
  });

  it('404 NotFound when the source assignment vanished before finalize', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: 'APPROVED_BY_TARGET' }),
    );
    tx.shiftAssignment.findUnique.mockResolvedValue(null);
    await expect(
      approveSwap({ swapId: 's1', actingUserId: 'u', asManager: true }, makePrisma(tx)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('approveSwap: manager finalization execution matrix', () => {
  it('transitions to APPROVED_BY_MANAGER and returns assignment+shift', async () => {
    const tx = managerFinalizeTx();
    const out = await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(out.status).toBe('ok');
    expect(out.swap.status).toBe('APPROVED_BY_MANAGER');
    expect(out.assignment?.id).toBe('a2');
    expect(out.assignment?.version).toBe(1);
    expect(out.assignment?.status).toBe('CONFIRMED');
    expect(out.shift?.id).toBe('shift-1');
    expect(out.shift?.version).toBe(1);
  });

  it('CANCELS the source assignment with a version increment', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(tx.shiftAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({
          assignmentStatus: 'CANCELLED',
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('UPSERTS the target assignment as CONFIRMED via SHIFT_SWAP source', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(tx.shiftAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shiftId_employeeId: { shiftId: 'shift-1', employeeId: 'emp-2' } },
        create: expect.objectContaining({
          shiftId: 'shift-1',
          employeeId: 'emp-2',
          assignmentStatus: 'CONFIRMED',
          source: 'SHIFT_SWAP',
          assignedByUserId: 'mgr',
        }),
        update: expect.objectContaining({
          assignmentStatus: 'CONFIRMED',
          source: 'SHIFT_SWAP',
          assignedByUserId: 'mgr',
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('bumps the shift version by one', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(tx.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shift-1' },
        data: { version: { increment: 1 } },
      }),
    );
  });

  it('records approvedByManagerId on the swap update', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr-77', asManager: true },
      makePrisma(tx),
    );
    expect(tx.shiftSwapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({
          status: 'APPROVED_BY_MANAGER',
          approvedByManagerId: 'mgr-77',
        }),
      }),
    );
  });

  it('writes an ASSIGN audit and a SWAP_APPROVED event', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(writeAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actionType: 'ASSIGN',
        entityType: 'ShiftSwapRequest',
        entityId: 's1',
      }),
    );
    expect(writeEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'SWAP_APPROVED',
        aggregateId: 's1',
        payload: expect.objectContaining({
          shiftId: 'shift-1',
          fromEmployeeId: 'emp-1',
          toEmployeeId: 'emp-2',
          newAssignmentId: 'a2',
        }),
      }),
    );
  });

  it('publishes SWAP_APPROVED with the committed event id', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(publishEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        eventType: 'SWAP_APPROVED',
        aggregateId: 's1',
      }),
    );
  });

  it('calls employeeScheduleMetrics.upsert exactly twice (source -, target +)', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    expect(tx.employeeScheduleMetrics.upsert).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// approveSwap — metrics delta math (hand-computed, fixed dates)
// ===========================================================================

describe('approveSwap: metrics delta math', () => {
  // For the anchor shift (08:00Z-16:00Z = 480 min, Mon morning weekday in IDT):
  //  - source employee gets deltaMinutes = -480, deltaShiftCount = -1
  //  - target employee gets deltaMinutes = +480, deltaShiftCount = +1
  // Update branch (employeeScheduleMetrics row exists) => increment objects.
  it('decrements source-employee metrics by the full shift length (-480)', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const sourceCall = tx.employeeScheduleMetrics.upsert.mock.calls.find(
      (c: any[]) => c[0].where.employeeId_weekStartDate.employeeId === 'emp-1',
    );
    expect(sourceCall).toBeDefined();
    expect(sourceCall![0].update).toMatchObject({
      totalScheduledMinutes: { increment: -480 },
      totalPaidMinutes: { increment: -480 },
      shiftCount: { increment: -1 },
    });
  });

  it('increments target-employee metrics by the full shift length (+480)', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const targetCall = tx.employeeScheduleMetrics.upsert.mock.calls.find(
      (c: any[]) => c[0].where.employeeId_weekStartDate.employeeId === 'emp-2',
    );
    expect(targetCall).toBeDefined();
    expect(targetCall![0].update).toMatchObject({
      totalScheduledMinutes: { increment: 480 },
      totalPaidMinutes: { increment: 480 },
      shiftCount: { increment: 1 },
    });
  });

  it('morning weekday shift sets morning increment only (no night/evening/weekend) on target', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const targetCall = tx.employeeScheduleMetrics.upsert.mock.calls.find(
      (c: any[]) => c[0].where.employeeId_weekStartDate.employeeId === 'emp-2',
    );
    const upd = targetCall![0].update;
    expect(upd.morningShiftCount).toEqual({ increment: 1 });
    expect(upd.nightShiftCount).toBeUndefined();
    expect(upd.eveningShiftCount).toBeUndefined();
    expect(upd.weekendShiftCount).toBeUndefined();
  });

  it('night shift (02:00Z -> 04:30Z) classifies as night, 150 minutes', async () => {
    // 2026-06-02T02:00Z in IDT (UTC+3) = 05:00 local => night (hour<6). 02:00->04:30Z = 150min.
    const nightShift = makeShift({
      startAtUtc: new Date('2026-06-02T02:00:00Z'),
      endAtUtc: new Date('2026-06-02T04:30:00Z'),
    });
    const tx = managerFinalizeTx({
      assignment: confirmedAssignment({ shift: nightShift }),
    });
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const targetCall = tx.employeeScheduleMetrics.upsert.mock.calls.find(
      (c: any[]) => c[0].where.employeeId_weekStartDate.employeeId === 'emp-2',
    );
    const upd = targetCall![0].update;
    expect(upd.totalScheduledMinutes).toEqual({ increment: 150 });
    expect(upd.nightShiftCount).toEqual({ increment: 1 });
    expect(upd.morningShiftCount).toBeUndefined();
  });

  it('evening shift (15:00Z -> 18:00Z) classifies as evening, 180 minutes', async () => {
    // 2026-06-01T15:00Z in IDT = 18:00 local => evening (12<=18<22). 180min.
    const eveningShift = makeShift({
      startAtUtc: new Date('2026-06-01T15:00:00Z'),
      endAtUtc: new Date('2026-06-01T18:00:00Z'),
    });
    const tx = managerFinalizeTx({
      assignment: confirmedAssignment({ shift: eveningShift }),
    });
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const targetCall = tx.employeeScheduleMetrics.upsert.mock.calls.find(
      (c: any[]) => c[0].where.employeeId_weekStartDate.employeeId === 'emp-2',
    );
    const upd = targetCall![0].update;
    expect(upd.totalScheduledMinutes).toEqual({ increment: 180 });
    expect(upd.eveningShiftCount).toEqual({ increment: 1 });
    expect(upd.nightShiftCount).toBeUndefined();
  });

  it('weekend shift (Saturday 2026-06-06 09:00Z) classifies as weekend + morning', async () => {
    // 2026-06-06 is Saturday. 09:00Z IDT = 12:00 local => evening actually (12<=12<22)
    // Use 06:00Z => 09:00 local => morning, day Saturday => weekend.
    const weekendShift = makeShift({
      startAtUtc: new Date('2026-06-06T06:00:00Z'),
      endAtUtc: new Date('2026-06-06T12:00:00Z'),
    });
    const tx = managerFinalizeTx({
      assignment: confirmedAssignment({ shift: weekendShift }),
    });
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const targetCall = tx.employeeScheduleMetrics.upsert.mock.calls.find(
      (c: any[]) => c[0].where.employeeId_weekStartDate.employeeId === 'emp-2',
    );
    const upd = targetCall![0].update;
    // 06:00Z -> 12:00Z = 360 min.
    expect(upd.totalScheduledMinutes).toEqual({ increment: 360 });
    expect(upd.morningShiftCount).toEqual({ increment: 1 });
    expect(upd.weekendShiftCount).toEqual({ increment: 1 });
  });

  it('source and target metrics share the same weekStartDate key', async () => {
    const tx = managerFinalizeTx();
    await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx),
    );
    const calls = tx.employeeScheduleMetrics.upsert.mock.calls;
    const wk1 = calls[0][0].where.employeeId_weekStartDate.weekStartDate.getTime();
    const wk2 = calls[1][0].where.employeeId_weekStartDate.weekStartDate.getTime();
    expect(wk1).toBe(wk2);
  });
});

// ===========================================================================
// rejectSwap — state matrix
// ===========================================================================

describe('rejectSwap: matrix', () => {
  it('404 SWAP_NOT_FOUND when swap missing', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(null);
    await expect(
      rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_NOT_FOUND', statusCode: 404 });
  });

  // Only PENDING and APPROVED_BY_TARGET can be rejected.
  const rejectableStates = ['PENDING', 'APPROVED_BY_TARGET'];
  it.each(rejectableStates)('rejects a swap in %s', async (state) => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: state }),
    );
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    const out = await rejectSwap(
      { swapId: 's1', actingUserId: 'u', reason: 'nope' },
      makePrisma(tx),
    );
    expect(out.status).toBe('ok');
    expect(out.swap.status).toBe('REJECTED');
  });

  const terminalStates = ['APPROVED_BY_MANAGER', 'REJECTED', 'CANCELLED', 'EXPIRED'];
  it.each(terminalStates)(
    'SWAP_WRONG_STATE when rejecting a swap already in %s',
    async (state) => {
      const tx = fakeTx();
      tx.shiftSwapRequest.findUnique.mockResolvedValue(
        pendingSwap({ status: state }),
      );
      await expect(
        rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx)),
      ).rejects.toMatchObject({
        code: 'SWAP_WRONG_STATE',
        statusCode: 409,
        details: { currentStatus: state },
      });
    },
  );

  it('does not update the swap row on a terminal-state reject', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: 'APPROVED_BY_MANAGER' }),
    );
    await expect(
      rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toBeDefined();
    expect(tx.shiftSwapRequest.update).not.toHaveBeenCalled();
  });

  it('sets status REJECTED in the update data', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    await rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx));
    expect(tx.shiftSwapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: { status: 'REJECTED' },
      }),
    );
  });

  it('writes UPDATE audit carrying the reason in the after-state', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    await rejectSwap(
      { swapId: 's1', actingUserId: 'mgr', reason: 'covered already' },
      makePrisma(tx),
    );
    expect(writeAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actionType: 'UPDATE',
        entityType: 'ShiftSwapRequest',
        entityId: 's1',
        userId: 'mgr',
        after: expect.objectContaining({ reason: 'covered already' }),
      }),
    );
  });

  it('writes SWAP_REJECTED event with reason payload', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    await rejectSwap(
      { swapId: 's1', actingUserId: 'u', reason: 'busy' },
      makePrisma(tx),
    );
    expect(writeEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'SWAP_REJECTED',
        aggregateId: 's1',
        payload: { reason: 'busy' },
      }),
    );
  });

  it('normalizes a missing reason to null in event payload', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    await rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx));
    expect(writeEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ payload: { reason: null } }),
    );
  });

  it('publishes SWAP_REJECTED with the committed event id', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    await rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx));
    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(publishEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        eventType: 'SWAP_REJECTED',
        aggregateId: 's1',
      }),
    );
  });

  it('uses the swap organizationId for the audit + event', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ organizationId: 'org-Z' }),
    );
    tx.shiftSwapRequest.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });
    await rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx));
    expect(writeEventMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ organizationId: 'org-Z' }),
    );
  });
});

// ===========================================================================
// Cross-cutting lifecycle invariants
// ===========================================================================

describe('swap lifecycle invariants', () => {
  it('a REJECTED swap can no longer be target-approved', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: 'REJECTED' }),
    );
    await expect(
      approveSwap(
        { swapId: 's1', actingUserId: 'u', approvingEmployeeId: 'emp-2', asManager: false },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE' });
  });

  it('an APPROVED_BY_MANAGER swap can no longer be rejected', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: 'APPROVED_BY_MANAGER' }),
    );
    await expect(
      rejectSwap({ swapId: 's1', actingUserId: 'u' }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE' });
  });

  it('an APPROVED_BY_TARGET swap cannot receive a second target approval', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: 'APPROVED_BY_TARGET' }),
    );
    await expect(
      approveSwap(
        { swapId: 's1', actingUserId: 'u', approvingEmployeeId: 'emp-2', asManager: false },
        makePrisma(tx),
      ),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE' });
  });

  it('manager cannot finalize a brand-new PENDING swap (must pass target approval first)', async () => {
    const tx = fakeTx();
    tx.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap({ status: 'PENDING' }));
    await expect(
      approveSwap({ swapId: 's1', actingUserId: 'u', asManager: true }, makePrisma(tx)),
    ).rejects.toMatchObject({ code: 'SWAP_WRONG_STATE' });
  });

  it('full lifecycle: PENDING -> APPROVED_BY_TARGET -> APPROVED_BY_MANAGER', async () => {
    // Stage 1: target approval.
    const tx1 = fakeTx();
    tx1.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
    tx1.shiftSwapRequest.update.mockResolvedValue({
      id: 's1',
      status: 'APPROVED_BY_TARGET',
    });
    const r1 = await approveSwap(
      { swapId: 's1', actingUserId: 'u', approvingEmployeeId: 'emp-2', asManager: false },
      makePrisma(tx1),
    );
    expect(r1.swap.status).toBe('APPROVED_BY_TARGET');

    // Stage 2: manager finalize.
    const tx2 = managerFinalizeTx();
    const r2 = await approveSwap(
      { swapId: 's1', actingUserId: 'mgr', asManager: true },
      makePrisma(tx2),
    );
    expect(r2.swap.status).toBe('APPROVED_BY_MANAGER');
  });
});
