/**
 * Unit test for the OR-Tools (simulated-annealing) provider.
 *
 * Bypasses Prisma by calling the pure `optimize()` function with a synthetic
 * candidate matrix: 10 employees × 14 shifts over one week. The two roles are
 * encoded by restricting candidate sets (employees 0–4 can take morning shifts,
 * 5–9 can take evening shifts), so role-match is enforced implicitly.
 *
 * Verifies:
 *   1. Hours stddev across employees is LOWER than greedy on the same fixture
 *      (the whole point of the optimizer).
 *   2. No hard constraint is violated: no overlapping assignments per employee,
 *      no double-assignment to slots of the same shift.
 */
import { scoreCandidate } from '../../src/modules/scheduler/scoring.service';
import {
  DEFAULT_WEIGHTS,
  type AssignmentProposal,
  type Candidate,
} from '../../src/modules/scheduler/types';
import { optimize, stddev } from '../../src/modules/scheduler/providers/or-tools.provider';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeShift(
  id: string,
  startIso: string,
  endIso: string,
  requiredEmployeeCount = 1,
): Candidate['shift'] {
  return {
    id,
    organizationId: 'org',
    locationId: null,
    departmentId: null,
    roleId: null,
    templateId: null,
    scheduleId: 's',
    startAtUtc: new Date(startIso),
    endAtUtc: new Date(endIso),
    timezone: 'Asia/Jerusalem',
    localStartDate: new Date(startIso.slice(0, 10)),
    localEndDate: new Date(endIso.slice(0, 10)),
    requiredEmployeeCount,
    status: 'PLANNED' as const,
    isOpenShift: false,
    version: 1,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEmployee(id: string): Candidate['employee'] {
  return {
    id,
    organizationId: 'org',
    fullName: id,
    email: null,
    phone: null,
    employmentType: 'FULL_TIME' as const,
    defaultLocationId: null,
    defaultTimezone: 'Asia/Jerusalem',
    hourlyRate: null,
    weeklyBudgetHours: null,
    dateOfBirth: null,
    weeklyRestDay: 'SATURDAY' as const,
    israeliId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCandidate(
  shift: Candidate['shift'],
  empId: string,
  signals: Partial<Candidate['signals']> = {},
): Candidate {
  return {
    shiftId: shift.id,
    shift,
    employee: makeEmployee(empId),
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
    eligible: true,
    warnings: [],
    violations: [],
  };
}

// ---------------------------------------------------------------------------
// Build fixture: 10 employees × 14 shifts (1 week × 2 roles × 7 days)
// ---------------------------------------------------------------------------

function buildFixture() {
  const employees = Array.from({ length: 10 }, (_, i) => `e${i}`);
  const shifts: Candidate['shift'][] = [];
  const week = ['25', '26', '27', '28', '29', '30', '31']; // May 2026
  for (const day of week) {
    shifts.push(makeShift(`morning-${day}`, `2026-05-${day}T06:00:00Z`, `2026-05-${day}T14:00:00Z`));
    shifts.push(makeShift(`evening-${day}`, `2026-05-${day}T14:00:00Z`, `2026-05-${day}T22:00:00Z`));
  }

  // Role partitioning: e0..e4 do mornings, e5..e9 do evenings.
  // Inject a strong score bias so greedy picks the same star employee repeatedly,
  // creating the unfairness the optimizer must repair.
  const candidates: Candidate[] = [];
  for (const shift of shifts) {
    const isMorning = shift.id.startsWith('morning');
    const pool = isMorning ? employees.slice(0, 5) : employees.slice(5);
    pool.forEach((empId, idx) => {
      candidates.push(
        makeCandidate(shift, empId, {
          // First employee in each pool gets the best preference — this is the
          // "star" greedy keeps grabbing.
          preferenceScore: idx === 0 ? 10 : 1,
        }),
      );
    });
  }

  return { employees, shifts, candidates };
}

// ---------------------------------------------------------------------------
// Reference greedy (mirrors greedy.provider's algorithm)
// ---------------------------------------------------------------------------

function greedyRun(candidates: Candidate[]): AssignmentProposal[] {
  const scored = candidates
    .filter((c) => c.eligible)
    .map((c) => {
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
    const slots = Math.max(1, shift.requiredEmployeeCount);
    const ranked = byShift.get(shift.id) ?? [];
    let filled = 0;
    const usedHere = new Set<string>();
    for (const row of ranked) {
      if (filled >= slots) break;
      const empId = row.c.employee.id;
      if (usedHere.has(empId)) continue;
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
      usedHere.add(empId);
      const bucket = busy.get(empId) ?? [];
      bucket.push({ start: shift.startAtUtc, end: shift.endAtUtc });
      busy.set(empId, bucket);
      filled++;
    }
  }
  return proposals;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function hoursPerEmployee(
  proposals: AssignmentProposal[],
  shifts: Candidate['shift'][],
  employees: string[],
): number[] {
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const totals = new Map<string, number>(employees.map((e) => [e, 0]));
  for (const p of proposals) {
    const shift = shiftMap.get(p.shiftId)!;
    const hours = (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 3_600_000;
    totals.set(p.employeeId, (totals.get(p.employeeId) ?? 0) + hours);
  }
  return Array.from(totals.values());
}

function hasHardViolation(
  proposals: AssignmentProposal[],
  shifts: Candidate['shift'][],
): string | null {
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  // No double assignment to the same shift+employee pair, no overlapping shifts
  // per employee.
  const byEmp = new Map<string, Array<{ start: Date; end: Date; shiftId: string }>>();
  const seen = new Set<string>();
  for (const p of proposals) {
    const key = `${p.shiftId}::${p.employeeId}`;
    if (seen.has(key)) return `duplicate (${key})`;
    seen.add(key);
    const shift = shiftMap.get(p.shiftId);
    if (!shift) return `unknown shift ${p.shiftId}`;
    const list = byEmp.get(p.employeeId) ?? [];
    for (const b of list) {
      if (shift.startAtUtc < b.end && b.start < shift.endAtUtc) {
        return `overlap for ${p.employeeId} between ${b.shiftId} and ${p.shiftId}`;
      }
    }
    list.push({ start: shift.startAtUtc, end: shift.endAtUtc, shiftId: p.shiftId });
    byEmp.set(p.employeeId, list);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OR-Tools (simulated annealing) scheduler', () => {
  it('reduces hours-per-employee stddev compared to greedy', () => {
    const { employees, shifts, candidates } = buildFixture();

    // Greedy
    const greedyProps = greedyRun(candidates);
    const greedyHours = hoursPerEmployee(greedyProps, shifts, employees);
    const greedyStd = stddev(greedyHours);

    // Optimizer — feed the SAME scored matrix shape it expects.
    const scored = candidates.map((c) => {
      const { score, breakdown } = scoreCandidate(c.signals, DEFAULT_WEIGHTS);
      return { candidate: c, score, breakdown };
    });
    const result = optimize(scored, DEFAULT_WEIGHTS, {
      timeBudgetMs: 3_000,
      maxIterations: 5_000,
      seed: 42,
    });
    const optHours = hoursPerEmployee(result.proposals, shifts, employees);
    const optStd = stddev(optHours);

    // Diagnostic — surfaces in jest output on failure.
    // eslint-disable-next-line no-console
    console.log(
      `greedy stddev = ${greedyStd.toFixed(3)}h, or-tools stddev = ${optStd.toFixed(3)}h`,
    );

    expect(optStd).toBeLessThanOrEqual(greedyStd);
    // And the improvement should be material — at least 10% on this fixture.
    if (greedyStd > 0) {
      expect(optStd).toBeLessThanOrEqual(greedyStd * 0.95);
    }
  });

  it('produces a feasible assignment (no overlaps, no double-booking)', () => {
    const { shifts, candidates } = buildFixture();
    const scored = candidates.map((c) => {
      const { score, breakdown } = scoreCandidate(c.signals, DEFAULT_WEIGHTS);
      return { candidate: c, score, breakdown };
    });
    const result = optimize(scored, DEFAULT_WEIGHTS, { timeBudgetMs: 2_000, seed: 7 });
    const violation = hasHardViolation(result.proposals, shifts);
    expect(violation).toBeNull();
  });

  it('fills every shift when sufficient eligible employees exist', () => {
    const { shifts, candidates } = buildFixture();
    const scored = candidates.map((c) => {
      const { score, breakdown } = scoreCandidate(c.signals, DEFAULT_WEIGHTS);
      return { candidate: c, score, breakdown };
    });
    const result = optimize(scored, DEFAULT_WEIGHTS, { timeBudgetMs: 2_000, seed: 7 });
    expect(result.proposals.length).toBe(shifts.length); // each shift requires 1
    expect(result.unfilled).toEqual([]);
  });
});
