import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../db/prisma';
import { generateCandidates } from '../candidate-generation.service';
import { scoreCandidate } from '../scoring.service';
import {
  DEFAULT_WEIGHTS,
  type AssignmentProposal,
  type Candidate,
  type CandidatePersistRow,
  type SchedulerInput,
  type SchedulerOutput,
  type SchedulerProvider,
  type ScoringWeights,
} from '../types';

/**
 * Greedy scheduler — for each shift, pick the highest-scoring eligible
 * employee not yet over-allocated. O(shifts × employees) — fine for ~10k
 * candidates. When the customer outgrows it, swap in ORToolsSchedulerProvider
 * behind the same SchedulerProvider interface.
 *
 * Constraints respected during the greedy walk:
 *   - one employee per shift slot (up to `requiredEmployeeCount`)
 *   - no employee assigned to two overlapping shifts within this run
 *   - employees with `blocked` validator outcome are pre-filtered
 */
export class GreedySchedulerProvider implements SchedulerProvider {
  readonly name = 'greedy';

  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run(input: SchedulerInput): Promise<SchedulerOutput> {
    const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) };

    const candidates = await generateCandidates(input.scheduleId, this.prisma);
    const eligible = candidates.filter((c) => c.eligible);

    // score every eligible candidate up front
    const scored = eligible.map((c) => {
      const { score, breakdown } = scoreCandidate(c.signals, weights);
      return { candidate: c, score, breakdown };
    });

    // group by shift, sorted high → low
    const byShift = new Map<string, typeof scored>();
    for (const row of scored) {
      const bucket = byShift.get(row.candidate.shiftId) ?? [];
      bucket.push(row);
      byShift.set(row.candidate.shiftId, bucket);
    }
    for (const bucket of byShift.values()) {
      bucket.sort((a, b) => b.score - a.score);
    }

    // walk shifts in chronological order, picking top-K respecting conflicts
    const orderedShifts = Array.from(new Set(scored.map((r) => r.candidate.shift.id)))
      .map((id) => scored.find((r) => r.candidate.shift.id === id)!.candidate.shift)
      .sort((a, b) => a.startAtUtc.getTime() - b.startAtUtc.getTime());

    const proposals: AssignmentProposal[] = [];
    const employeeBusy = new Map<string, Array<{ start: Date; end: Date }>>();
    const unfilled: string[] = [];

    for (const shift of orderedShifts) {
      const slots = Math.max(1, shift.requiredEmployeeCount);
      const ranked = byShift.get(shift.id) ?? [];
      let filled = 0;

      for (const row of ranked) {
        if (filled >= slots) break;
        const empId = row.candidate.employee.id;
        if (overlapsExisting(employeeBusy.get(empId), shift.startAtUtc, shift.endAtUtc)) {
          continue;
        }
        proposals.push({
          shiftId: shift.id,
          employeeId: empId,
          score: row.score,
          breakdown: row.breakdown,
          warnings: row.candidate.warnings,
          reason: `greedy pick — score ${row.score.toFixed(3)}`,
        });
        rememberBusy(employeeBusy, empId, shift.startAtUtc, shift.endAtUtc);
        filled++;
      }
      if (filled < slots) unfilled.push(shift.id);
    }

    const _candidateRows: CandidatePersistRow[] = scored.map((row) => ({
      organizationId: row.candidate.shift.organizationId,
      shiftId: row.candidate.shift.id,
      employeeId: row.candidate.employee.id,
      eligibilityScore: row.score,
      violationsCount: row.candidate.violations.length,
      warningsCount: row.candidate.warnings.length,
    }));

    const totalCandidatesConsidered = scored.length;
    const averageScore =
      proposals.length > 0
        ? proposals.reduce((s, p) => s + p.score, 0) / proposals.length
        : 0;

    return {
      scheduleId: input.scheduleId,
      proposals,
      unfilledShiftIds: unfilled,
      stats: {
        totalShifts: orderedShifts.length,
        totalCandidatesConsidered,
        proposalsGenerated: proposals.length,
        averageScore,
      },
      providerName: this.name,
      _candidateRows,
    };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function overlapsExisting(
  busy: Array<{ start: Date; end: Date }> | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!busy) return false;
  for (const b of busy) {
    if (start < b.end && b.start < end) return true;
  }
  return false;
}

function rememberBusy(
  map: Map<string, Array<{ start: Date; end: Date }>>,
  empId: string,
  start: Date,
  end: Date,
): void {
  const bucket = map.get(empId) ?? [];
  bucket.push({ start, end });
  map.set(empId, bucket);
}

// Re-export Candidate so future provider files can import from one place.
export type { Candidate };
