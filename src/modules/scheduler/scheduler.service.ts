import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma, ensureTx } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { GreedySchedulerProvider } from './providers/greedy.provider';
import { OrToolsSchedulerProvider } from './providers/or-tools.provider';
import { applyAssignment } from '../assignments/assignments.service';
import { writeAudit } from '../audit/audit.service';
import { NotFoundError } from '../../shared/errors';
import { mapSchedule } from '../reads/reads.routes';
import type {
  SchedulerInput,
  SchedulerOutput,
  SchedulerProvider,
} from './types';

export interface ApplyProposalInput {
  shiftId: string;
  employeeId: string;
  score?: number;
  breakdown?: unknown;
}

export interface ApplyProposalsResult {
  applied: number;
  failed: Array<{ shiftId: string; employeeId: string; code: string; message: string }>;
  schedule: ReturnType<typeof mapSchedule> | null;
}

export type ProviderName = 'greedy' | 'or-tools';

/**
 * SchedulerService — strategy-pattern orchestrator.
 *
 * Default provider is greedy. `or-tools` is reserved for a future adapter and
 * currently falls back to greedy with a warning, so the API contract is
 * stable when we ship the optimizer.
 */
export class SchedulerService {
  constructor(private readonly prisma: Db = defaultPrisma) {}

  pickProvider(name: ProviderName = 'greedy'): SchedulerProvider {
    // Providers expect a PrismaClient — when running inside an outer transaction
    // (Db is a TransactionClient) we still pass it through; greedy / or-tools
    // only call read-only helpers on the prisma surface.
    const p = this.prisma as PrismaClient;
    switch (name) {
      case 'greedy':
        return new GreedySchedulerProvider(p);
      case 'or-tools':
        return new OrToolsSchedulerProvider(p);
      default:
        return new GreedySchedulerProvider(p);
    }
  }

  async run(
    input: SchedulerInput,
    providerName: ProviderName = 'greedy',
  ): Promise<SchedulerOutput & { warning?: string }> {
    const provider = this.pickProvider(providerName);
    try {
      return await provider.run(input);
    } catch (err) {
      if (providerName === 'or-tools') {
        // Fail-soft: optimizer crashed (e.g., no feasible solution). Fall back
        // to greedy so the API still returns proposals, but surface the issue.
        const fallback = new GreedySchedulerProvider(this.prisma as PrismaClient);
        const result = await fallback.run(input);
        const message = err instanceof Error ? err.message : String(err);
        return { ...result, warning: `or-tools optimizer failed (${message}); fell back to greedy` };
      }
      throw err;
    }
  }

  async applyProposals(
    scheduleId: string,
    proposals: ApplyProposalInput[],
    actingUserId: string,
    organizationId?: string,
  ): Promise<ApplyProposalsResult> {
    // Cross-tenant guard: ensure the schedule belongs to the caller's org.
    if (organizationId) {
      const sched = await this.prisma.schedule.findFirst({
        where: { id: scheduleId, organizationId },
        select: { id: true },
      });
      if (!sched) {
        return { applied: 0, failed: [], schedule: null };
      }
    }
    let applied = 0;
    const failed: ApplyProposalsResult['failed'] = [];

    for (const p of proposals) {
      // Each applyAssignment is its own transaction; we sequence them so a single
      // proposal failure does not abort the entire batch. Need current shift
      // version for the optimistic concurrency check.
      try {
        const shift = await this.prisma.shift.findFirst({
          where: organizationId
            ? { id: p.shiftId, organizationId }
            : { id: p.shiftId },
          select: { version: true },
        });
        if (!shift) {
          failed.push({
            shiftId: p.shiftId,
            employeeId: p.employeeId,
            code: 'NOT_FOUND',
            message: 'Shift not found',
          });
          continue;
        }
        await applyAssignment(
          {
            shiftId: p.shiftId,
            employeeId: p.employeeId,
            expectedShiftVersion: shift.version,
            action: 'assign',
            acknowledgeWarnings: true,
            actingUserId,
            organizationId,
          },
          this.prisma,
        );
        applied++;
      } catch (err) {
        const e = err as { code?: string; message?: string };
        failed.push({
          shiftId: p.shiftId,
          employeeId: p.employeeId,
          code: e.code ?? 'APPLY_FAILED',
          message: e.message ?? 'Failed to apply proposal',
        });
      }
    }

    const updated = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        shifts: {
          include: { role: true, assignments: true },
          orderBy: { startAtUtc: 'asc' },
        },
      },
    });
    if (!updated) throw new NotFoundError('Schedule not found');

    return { applied, failed, schedule: mapSchedule(updated) };
  }

  async publishSchedule(
    scheduleId: string,
    actingUserId: string,
  ): Promise<ReturnType<typeof mapSchedule>> {
    return ensureTx(this.prisma, async (tx) => {
      const existing = await tx.schedule.findUnique({ where: { id: scheduleId } });
      if (!existing) throw new NotFoundError('Schedule not found');

      const updated = await tx.schedule.update({
        where: { id: scheduleId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          version: { increment: 1 },
        },
        include: {
          shifts: {
            include: { role: true, assignments: true },
            orderBy: { startAtUtc: 'asc' },
          },
        },
      });

      await writeAudit(tx, {
        organizationId: existing.organizationId,
        scheduleId: existing.id,
        userId: actingUserId,
        actionType: 'PUBLISH',
        entityType: 'Schedule',
        entityId: existing.id,
        before: { status: existing.status, publishedAt: existing.publishedAt },
        after: { status: updated.status, publishedAt: updated.publishedAt },
      });

      return mapSchedule(updated);
    });
  }
}

export { type SchedulerInput, type SchedulerOutput, type AssignmentProposal } from './types';
