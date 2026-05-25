import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma, ensureTx, withOrgContext } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { GreedySchedulerProvider } from './providers/greedy.provider';
import { OrToolsSchedulerProvider } from './providers/or-tools.provider';
import { applyAssignment } from '../assignments/assignments.service';
import { writeAudit } from '../audit/audit.service';
import { NotFoundError } from '../../shared/errors';
import { mapSchedule } from '../reads/reads.routes';
import { computeWeeklyCost } from './labor-cost.service';
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
    organizationId?: string,
  ): Promise<
    SchedulerOutput & {
      warning?: string;
      costEstimate?: { totalAgorot: number; deltaAgorot: number } | null;
    }
  > {
    const provider = this.pickProvider(providerName);
    let result: SchedulerOutput & { warning?: string };
    try {
      result = await provider.run(input);
    } catch (err) {
      if (providerName === 'or-tools') {
        // Fail-soft: optimizer crashed (e.g., no feasible solution). Fall back
        // to greedy so the API still returns proposals, but surface the issue.
        const fallback = new GreedySchedulerProvider(this.prisma as PrismaClient);
        const fallbackResult = await fallback.run(input);
        const message = err instanceof Error ? err.message : String(err);
        result = {
          ...fallbackResult,
          warning: `or-tools optimizer failed (${message}); fell back to greedy`,
        };
      } else {
        throw err;
      }
    }

    // Best-effort: attach a cost estimate so the UI can show a live meter
    // right after the auto-schedule. Returns null if no rates set at all.
    let costEstimate: { totalAgorot: number; deltaAgorot: number } | null = null;
    if (organizationId) {
      try {
        const report = await computeWeeklyCost(
          { organizationId, scheduleId: input.scheduleId },
          this.prisma,
        );
        if (report) {
          costEstimate = {
            totalAgorot: report.totalAgorot,
            deltaAgorot: report.deltaAgorot,
          };
        }
      } catch {
        // Cost is non-critical to the auto-schedule contract; swallow.
        costEstimate = null;
      }
    }
    return { ...result, costEstimate };
  }

  async applyProposals(
    scheduleId: string,
    proposals: ApplyProposalInput[],
    actingUserId: string,
    organizationId?: string,
  ): Promise<ApplyProposalsResult> {
    // Per-proposal tenancy is enforced inside applyAssignment via
    // organizationId param. Each proposal runs in its own short
    // RLS-scoped transaction (parallel) so the total wall time stays
    // well under the Vercel function and Accelerate transaction caps,
    // even for batches of 12+ proposals.
    const orgIdForRls = organizationId ?? '';

    const settled = await Promise.all(
      proposals.map(async (p): Promise<
        { ok: true } | { ok: false; code: string; message: string; shiftId: string; employeeId: string }
      > => {
        try {
          await withOrgContext(orgIdForRls).query(async (tx) => {
            const shift = await tx.shift.findFirst({
              where: organizationId
                ? { id: p.shiftId, organizationId }
                : { id: p.shiftId },
              select: { version: true },
            });
            if (!shift) {
              throw Object.assign(new Error('Shift not found'), { code: 'NOT_FOUND' });
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
              tx,
            );
          });
          return { ok: true } as const;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          return {
            ok: false,
            shiftId: p.shiftId,
            employeeId: p.employeeId,
            code: e.code ?? 'APPLY_FAILED',
            message: e.message ?? 'Failed to apply proposal',
          } as const;
        }
      }),
    );

    const applied = settled.filter((r) => r.ok).length;
    const failed: ApplyProposalsResult['failed'] = settled
      .filter((r): r is { ok: false; code: string; message: string; shiftId: string; employeeId: string } => !r.ok)
      .map(({ shiftId, employeeId, code, message }) => ({ shiftId, employeeId, code, message }));

    // Final schedule fetch in its own short RLS-scoped tx.
    const updated = await withOrgContext(orgIdForRls).query((tx) =>
      tx.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          shifts: {
            include: { role: true, assignments: true },
            orderBy: { startAtUtc: 'asc' },
          },
        },
      }),
    );
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
