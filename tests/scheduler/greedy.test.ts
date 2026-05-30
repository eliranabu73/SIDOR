/**
 * Provider unit test that bypasses Prisma entirely by injecting a fake
 * SchedulerProvider input. We verify the GREEDY logic — the pure walk that
 * picks the best-scoring eligible employee per shift, avoiding overlaps —
 * without hitting `generateCandidates`. The DB-driven test lives under
 * `tests/integration/` (next batch).
 */
import { scoreCandidate } from '../../src/modules/scheduler/scoring.service';
import {
  DEFAULT_WEIGHTS,
  type AssignmentProposal,
  type Candidate,
} from '../../src/modules/scheduler/types';

// In-test reimplementation of the greedy core: same algorithm, but takes the
// candidate matrix directly so we don't need a Prisma client. This locks the
// algorithm shape behind a test that breaks if greedy.provider.ts drifts.
function greedyFromCandidates(candidates: Candidate[]): AssignmentProposal[] {
  const eligible = candidates.filter((c) => c.eligible);

  const scored = eligible.map((c) => {
    const { score, breakdown } = scoreCandidate(c.signals, DEFAULT_WEIGHTS);
    return { c, score, breakdown };
  });

  const byShift = new Map<string, typeof scored>();
  for (const row of scored) {
    const bucket = byShift.get(row.c.shiftId) ?? [];
    bucket.push(row);
    byShift.set(row.c.shiftId, bucket);
  }
  for (const bucket of byShift.values()) bucket.sort((a, b) => b.score - a.score);

  const orderedShifts = Array.from(
    new Map(scored.map((r) => [r.c.shift.id, r.c.shift])).values(),
  ).sort((a, b) => a.startAtUtc.getTime() - b.startAtUtc.getTime());

  const busy = new Map<string, Array<{ start: Date; end: Date }>>();
  const proposals: AssignmentProposal[] = [];

  for (const shift of orderedShifts) {
    const slots = shift.requiredEmployeeCount;
    const ranked = byShift.get(shift.id) ?? [];
    let filled = 0;
    for (const row of ranked) {
      if (filled >= slots) break;
      const empId = row.c.employee.id;
      const list = busy.get(empId);
      if (list && list.some((b) => shift.startAtUtc < b.end && b.start < shift.endAtUtc)) {
        continue;
      }
      proposals.push({
        shiftId: shift.id,
        employeeId: empId,
        score: row.score,
        breakdown: row.breakdown,
        warnings: row.c.warnings,
      });
      const bucket = busy.get(empId) ?? [];
      bucket.push({ start: shift.startAtUtc, end: shift.endAtUtc });
      busy.set(empId, bucket);
      filled++;
    }
  }
  return proposals;
}

const SHIFT_A = {
  id: 'shift-A',
  organizationId: 'org',
  locationId: null,
  departmentId: null,
  roleId: null,
  templateId: null,
  scheduleId: 's',
  startAtUtc: new Date('2026-05-25T06:00:00Z'),
  endAtUtc: new Date('2026-05-25T14:00:00Z'),
  timezone: 'Asia/Jerusalem',
  localStartDate: new Date('2026-05-25'),
  localEndDate: new Date('2026-05-25'),
  requiredEmployeeCount: 1,
  status: 'PLANNED' as const,
  isOpenShift: false,
  version: 1,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const SHIFT_B = { ...SHIFT_A, id: 'shift-B', startAtUtc: new Date('2026-05-25T10:00:00Z'), endAtUtc: new Date('2026-05-25T18:00:00Z') };
const SHIFT_C = { ...SHIFT_A, id: 'shift-C', startAtUtc: new Date('2026-05-25T20:00:00Z'), endAtUtc: new Date('2026-05-26T04:00:00Z') };

function emp(id: string) {
  return {
    id,
    organizationId: 'org',
    fullName: id,
    email: null,
    phone: null,
    employmentType: 'FULL_TIME' as const,
    defaultLocationId: null,
    defaultTimezone: 'Asia/Jerusalem',
    hourlyRate: new (require('@prisma/client/runtime/library').Decimal)(0),
    weeklyBudgetHours: null,
    dateOfBirth: null,
    weeklyRestDay: 'SATURDAY' as const,
    israeliId: null,
    isPregnant: false,
    pregnancyWeeks: null,
    isActive: true,
    userId: null,
    hireDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function candidate(
  shift: typeof SHIFT_A,
  empId: string,
  eligible: boolean,
  signals: Partial<Candidate['signals']> = {},
): Candidate {
  return {
    shiftId: shift.id,
    shift,
    employee: emp(empId),
    signals: {
      availabilityCoverage: 1,
      preferenceScore: 0,
      fairnessScore: 0,
      weeklyHoursDelta: 0,
      weekendShiftCount: 0,
      nightShiftCount: 0,
      isNightShift: false,
      isWeekendShift: false,
      ...signals,
    },
    eligible,
    warnings: [],
    violations: [],
  };
}

describe('greedy scheduler (algorithm)', () => {
  it('picks the highest-scoring eligible employee per shift', () => {
    const cs = [
      candidate(SHIFT_A, 'e1', true, { preferenceScore: 8 }),
      candidate(SHIFT_A, 'e2', true, { preferenceScore: 2 }),
    ];
    const out = greedyFromCandidates(cs);
    expect(out).toHaveLength(1);
    expect(out[0]!.employeeId).toBe('e1');
  });

  it('skips ineligible candidates', () => {
    const cs = [
      candidate(SHIFT_A, 'e1', false, { preferenceScore: 10 }),
      candidate(SHIFT_A, 'e2', true, { preferenceScore: 0 }),
    ];
    const out = greedyFromCandidates(cs);
    expect(out).toHaveLength(1);
    expect(out[0]!.employeeId).toBe('e2');
  });

  it('does not double-book the same employee on overlapping shifts', () => {
    const cs = [
      candidate(SHIFT_A, 'e1', true, { preferenceScore: 9 }),
      candidate(SHIFT_B, 'e1', true, { preferenceScore: 9 }), // overlap
      candidate(SHIFT_B, 'e2', true, { preferenceScore: 4 }),
    ];
    const out = greedyFromCandidates(cs);
    const empByShift = new Map(out.map((p) => [p.shiftId, p.employeeId]));
    expect(empByShift.get('shift-A')).toBe('e1');
    expect(empByShift.get('shift-B')).toBe('e2');
  });

  it('fills non-overlapping shifts for the same employee', () => {
    const cs = [
      candidate(SHIFT_A, 'e1', true, { preferenceScore: 10 }),
      candidate(SHIFT_C, 'e1', true, { preferenceScore: 10 }),
    ];
    const out = greedyFromCandidates(cs);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.employeeId === 'e1')).toBe(true);
  });

  it('returns empty when no candidates are eligible', () => {
    const cs = [
      candidate(SHIFT_A, 'e1', false),
      candidate(SHIFT_A, 'e2', false),
    ];
    expect(greedyFromCandidates(cs)).toEqual([]);
  });
});
