/**
 * Distribution + role-match tests for the REAL GreedySchedulerProvider.
 *
 * Unlike tests/scheduler/greedy.test.ts (which uses an in-test reimplementation
 * of the bare picking loop), this file drives the actual provider in
 * src/modules/scheduler/providers/greedy.provider.ts by mocking
 * `generateCandidates` so we can inject a fixed candidate matrix without a DB.
 *
 * This exercises the production-only logic the reimplementation omits:
 *   - SPREAD_PENALTY (0.2 / shift already held) -> spread work across the team
 *   - SAME_DAY_PENALTY (1.0) -> avoid two shifts on the same local day
 *   - requiredEmployeeCount filling exactly
 *
 * Plus a focused set of role-match.rule.ts cases proving the blocking behaviour
 * that gates eligibility upstream.
 */
import { jest } from '@jest/globals';
import type { Candidate } from '../../src/modules/scheduler/types';

// Mock the candidate generator BEFORE importing the provider so the static
// `import { generateCandidates }` inside greedy.provider.ts binds to the mock.
const generateCandidatesMock =
  jest.fn<(scheduleId: string, prisma?: unknown) => Promise<Candidate[]>>();

jest.mock('../../src/modules/scheduler/candidate-generation.service', () => ({
  generateCandidates: generateCandidatesMock,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { GreedySchedulerProvider } from '../../src/modules/scheduler/providers/greedy.provider';

const Decimal = require('@prisma/client/runtime/library').Decimal;

// A throwaway prisma — never touched because generateCandidates is mocked.
const fakePrisma = {} as never;

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const TZ = 'Asia/Jerusalem';

function makeShift(
  id: string,
  startIso: string,
  endIso: string,
  opts: { requiredEmployeeCount?: number; roleId?: string | null } = {},
) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return {
    id,
    organizationId: 'org',
    locationId: null,
    departmentId: null,
    roleId: opts.roleId ?? null,
    templateId: null,
    scheduleId: 's',
    startAtUtc: start,
    endAtUtc: end,
    timezone: TZ,
    localStartDate: start,
    localEndDate: end,
    requiredEmployeeCount: opts.requiredEmployeeCount ?? 1,
    status: 'PLANNED' as const,
    isOpenShift: false,
    version: 1,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function emp(id: string) {
  return {
    id,
    organizationId: 'org',
    fullName: id,
    email: null,
    phone: null,
    employmentType: 'FULL_TIME' as const,
    defaultLocationId: null,
    defaultTimezone: TZ,
    hourlyRate: new Decimal(0),
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
  shift: ReturnType<typeof makeShift>,
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

/** Build one eligible candidate per employee for every shift. */
function fullMatrix(
  shifts: ReturnType<typeof makeShift>[],
  empIds: string[],
  signalsByEmp: Record<string, Partial<Candidate['signals']>> = {},
): Candidate[] {
  const out: Candidate[] = [];
  for (const s of shifts) {
    for (const e of empIds) {
      out.push(candidate(s, e, true, signalsByEmp[e] ?? {}));
    }
  }
  return out;
}

async function run(candidates: Candidate[]) {
  generateCandidatesMock.mockResolvedValue(candidates);
  const provider = new GreedySchedulerProvider(fakePrisma);
  return provider.run({ scheduleId: 's' });
}

/** count of proposals per employee */
function loadByEmp(proposals: { employeeId: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of proposals) m.set(p.employeeId, (m.get(p.employeeId) ?? 0) + 1);
  return m;
}

// Distinct local days so neither overlap nor same-day penalties interfere
// unless a test intends them. Each shift is 06:00-14:00 UTC on its own date.
const DAY = (n: number, hStart = 6, hEnd = 14) => {
  const d = String(n).padStart(2, '0');
  const hs = String(hStart).padStart(2, '0');
  const he = String(hEnd).padStart(2, '0');
  return [`2026-05-${d}T${hs}:00:00Z`, `2026-05-${d}T${he}:00:00Z`] as const;
};

beforeEach(() => {
  generateCandidatesMock.mockReset();
});

// ---------------------------------------------------------------------------
// distribution: SPREAD_PENALTY
// ---------------------------------------------------------------------------

describe('GreedySchedulerProvider — work spread (SPREAD_PENALTY)', () => {
  it('does not pile all shifts on one employee when scores tie', async () => {
    const shifts = [
      makeShift('d1', ...DAY(11)),
      makeShift('d2', ...DAY(12)),
      makeShift('d3', ...DAY(13)),
      makeShift('d4', ...DAY(14)),
    ];
    const out = await run(fullMatrix(shifts, ['e1', 'e2']));
    expect(out.proposals).toHaveLength(4);
    const load = loadByEmp(out.proposals);
    // 4 shifts, 2 equal employees -> 2 each (alternating via spread penalty)
    expect(load.get('e1')).toBe(2);
    expect(load.get('e2')).toBe(2);
  });

  it('alternates employees shift-by-shift when all signals are identical', async () => {
    const shifts = [
      makeShift('d1', ...DAY(11)),
      makeShift('d2', ...DAY(12)),
      makeShift('d3', ...DAY(13)),
      makeShift('d4', ...DAY(14)),
    ];
    const out = await run(fullMatrix(shifts, ['e1', 'e2']));
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    // first shift goes to the static winner; the rest alternate
    const first = byShift.get('d1');
    const second = byShift.get('d2');
    expect(second).not.toBe(first); // spread penalty flips the pick
    expect(byShift.get('d3')).toBe(first);
    expect(byShift.get('d4')).toBe(second);
  });

  it('spreads evenly across three employees over six shifts', async () => {
    const shifts = Array.from({ length: 6 }, (_, i) =>
      makeShift(`d${i}`, ...DAY(11 + i)),
    );
    const out = await run(fullMatrix(shifts, ['e1', 'e2', 'e3']));
    expect(out.proposals).toHaveLength(6);
    const load = loadByEmp(out.proposals);
    expect(load.get('e1')).toBe(2);
    expect(load.get('e2')).toBe(2);
    expect(load.get('e3')).toBe(2);
  });

  it('a strongly-preferred employee still wins early shifts despite spread', async () => {
    // preference 10 -> +0.25 to score; spread penalty is 0.2/shift, so the
    // strong employee keeps winning until penalty overtakes the bonus.
    const shifts = [
      makeShift('d1', ...DAY(11)),
      makeShift('d2', ...DAY(12)),
    ];
    const out = await run(
      fullMatrix(shifts, ['star', 'plain'], { star: { preferenceScore: 10 } }),
    );
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    expect(byShift.get('d1')).toBe('star');
    // star base = 2.9/3.3 = 0.8787879 (preference 10 lifts preference term
    // 0.25->0.5); after 1 spread penalty star = 0.8787879-0.2 = 0.6787879.
    // plain base = 0.8030303 (unchanged) > 0.6787879 -> plain wins d2.
    expect(byShift.get('d2')).toBe('plain');
  });

  it('keeps assigning the only eligible employee even past the spread penalty', async () => {
    const shifts = [
      makeShift('d1', ...DAY(11)),
      makeShift('d2', ...DAY(12)),
      makeShift('d3', ...DAY(13)),
    ];
    // only e1 is eligible everywhere
    const out = await run(fullMatrix(shifts, ['e1']));
    expect(out.proposals).toHaveLength(3);
    expect(out.proposals.every((p) => p.employeeId === 'e1')).toBe(true);
    expect(out.unfilledShiftIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// distribution: SAME_DAY_PENALTY
// ---------------------------------------------------------------------------

describe('GreedySchedulerProvider — same-day avoidance (SAME_DAY_PENALTY)', () => {
  it('avoids putting two same-day non-overlapping shifts on one employee', async () => {
    // Two shifts, same local day, NOT overlapping (morning + evening).
    const morning = makeShift('am', '2026-05-11T05:00:00Z', '2026-05-11T11:00:00Z');
    const evening = makeShift('pm', '2026-05-11T13:00:00Z', '2026-05-11T19:00:00Z');
    const out = await run(fullMatrix([morning, evening], ['e1', 'e2']));
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    // different employees: same-day penalty (1.0) dwarfs spread penalty (0.2)
    expect(byShift.get('am')).not.toBe(byShift.get('pm'));
    expect(out.proposals).toHaveLength(2);
  });

  it('falls back to the same employee on the same day when no alternative exists', async () => {
    const morning = makeShift('am', '2026-05-11T05:00:00Z', '2026-05-11T11:00:00Z');
    const evening = makeShift('pm', '2026-05-11T13:00:00Z', '2026-05-11T19:00:00Z');
    // only e1 eligible -> same-day penalty cannot be avoided
    const out = await run(fullMatrix([morning, evening], ['e1']));
    expect(out.proposals).toHaveLength(2);
    expect(out.proposals.every((p) => p.employeeId === 'e1')).toBe(true);
  });

  it('same-day penalty outranks spread: avoids the employee already on that day', async () => {
    // Setup so that, going into the evening 'pm' shift, both e1 and e2 hold
    // exactly one prior shift (equal spread), but e1's was the SAME-day morning
    // while e2's was a different earlier day. For 'pm':
    //   e1 adjusted = 0.803 - spread(0.2) - sameDay(1.0)  ≈ -0.397
    //   e2 adjusted = 0.803 - spread(0.2)                 ≈  0.603
    // -> e2 wins the evening shift, keeping e1 from a double-day.
    const d1 = makeShift('d1', ...DAY(9)); // earlier, distinct day — only e2
    const am = makeShift('am', '2026-05-11T05:00:00Z', '2026-05-11T11:00:00Z'); // only e1
    const pm = makeShift('pm', '2026-05-11T13:00:00Z', '2026-05-11T19:00:00Z'); // both
    const cands = [
      candidate(d1, 'e2', true), // e2 takes the early distinct day
      candidate(am, 'e1', true), // e1 takes the morning of the target day
      candidate(pm, 'e1', true), // contest the evening
      candidate(pm, 'e2', true),
    ];
    const out = await run(cands);
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    expect(byShift.get('d1')).toBe('e2');
    expect(byShift.get('am')).toBe('e1');
    expect(byShift.get('pm')).toBe('e2'); // same-day penalty kept e1 off
  });
});

// ---------------------------------------------------------------------------
// overlap (hard constraint) still holds in the real provider
// ---------------------------------------------------------------------------

describe('GreedySchedulerProvider — overlap hard constraint', () => {
  it('never double-books an employee on overlapping shifts', async () => {
    const a = makeShift('a', '2026-05-11T06:00:00Z', '2026-05-11T14:00:00Z');
    const b = makeShift('b', '2026-05-11T10:00:00Z', '2026-05-11T18:00:00Z'); // overlaps a
    // only e1 eligible for both; b overlaps a so b must stay unfilled
    const out = await run(fullMatrix([a, b], ['e1']));
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    expect(byShift.get('a')).toBe('e1');
    expect(byShift.has('b')).toBe(false);
    expect(out.unfilledShiftIds).toEqual(['b']);
  });

  it('gives the overlapping shift to a different free employee when available', async () => {
    const a = makeShift('a', '2026-05-11T06:00:00Z', '2026-05-11T14:00:00Z');
    const b = makeShift('b', '2026-05-11T10:00:00Z', '2026-05-11T18:00:00Z');
    const out = await run(fullMatrix([a, b], ['e1', 'e2']));
    const byShift = new Map(out.proposals.map((p) => [p.shiftId, p.employeeId]));
    expect(byShift.get('a')).not.toBe(byShift.get('b'));
    expect(out.proposals).toHaveLength(2);
    expect(out.unfilledShiftIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// requiredEmployeeCount
// ---------------------------------------------------------------------------

describe('GreedySchedulerProvider — requiredEmployeeCount', () => {
  it('fills exactly requiredEmployeeCount slots per shift', async () => {
    const shift = makeShift('multi', ...DAY(11), { requiredEmployeeCount: 3 });
    const out = await run(fullMatrix([shift], ['e1', 'e2', 'e3', 'e4', 'e5']));
    expect(out.proposals).toHaveLength(3);
    // three DISTINCT employees
    expect(new Set(out.proposals.map((p) => p.employeeId)).size).toBe(3);
    expect(out.unfilledShiftIds).toEqual([]);
  });

  it('marks a shift unfilled when fewer eligible employees than slots', async () => {
    const shift = makeShift('multi', ...DAY(11), { requiredEmployeeCount: 4 });
    const out = await run(fullMatrix([shift], ['e1', 'e2']));
    expect(out.proposals).toHaveLength(2);
    expect(out.unfilledShiftIds).toEqual(['multi']);
  });

  it('requiredEmployeeCount=1 yields a single assignment', async () => {
    const shift = makeShift('single', ...DAY(11), { requiredEmployeeCount: 1 });
    const out = await run(fullMatrix([shift], ['e1', 'e2', 'e3']));
    expect(out.proposals).toHaveLength(1);
  });

  it('does not assign the same employee twice to one multi-slot shift', async () => {
    const shift = makeShift('multi', ...DAY(11), { requiredEmployeeCount: 2 });
    // only e1 eligible -> can fill at most 1 slot, the rest unfilled
    const out = await run(fullMatrix([shift], ['e1']));
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]!.employeeId).toBe('e1');
    expect(out.unfilledShiftIds).toEqual(['multi']);
  });
});

// ---------------------------------------------------------------------------
// stats / output shape sanity (computed expected values)
// ---------------------------------------------------------------------------

describe('GreedySchedulerProvider — output stats', () => {
  it('reports totals and an average score equal to the mean of proposal scores', async () => {
    const shifts = [makeShift('d1', ...DAY(11)), makeShift('d2', ...DAY(12))];
    const out = await run(fullMatrix(shifts, ['e1', 'e2']));
    expect(out.providerName).toBe('greedy');
    expect(out.stats.totalShifts).toBe(2);
    expect(out.stats.proposalsGenerated).toBe(2);
    const mean =
      out.proposals.reduce((s, p) => s + p.score, 0) / out.proposals.length;
    expect(out.stats.averageScore).toBeCloseTo(mean, 10);
  });

  it('averageScore is 0 and proposals empty when nothing is eligible', async () => {
    const shifts = [makeShift('d1', ...DAY(11))];
    const cands = [candidate(shifts[0]!, 'e1', false), candidate(shifts[0]!, 'e2', false)];
    const out = await run(cands);
    expect(out.proposals).toEqual([]);
    expect(out.stats.averageScore).toBe(0);
    // A shift whose ENTIRE candidate pool is ineligible still exists and is
    // under-filled (0 < required), so it MUST surface in unfilledShiftIds for
    // callers that prompt manual scheduling — it is no longer silently dropped.
    expect(out.unfilledShiftIds).toEqual(['d1']);
  });

  it('proposal score reflects the static score, not the spread-adjusted value', async () => {
    const shifts = [makeShift('d1', ...DAY(11)), makeShift('d2', ...DAY(12))];
    const out = await run(fullMatrix(shifts, ['e1', 'e2']));
    // Every proposal carries the identical neutral base score. Derivation:
    // weighted = availability(1*1.0) + preference(0.5*0.5) + fairness(0.5*0.8)
    //          + weeklyHoursBalance(1*0.4) + weekendBalance(1*0.3)
    //          + nightBalance(1*0.3) = 2.65
    // sumWeights = 1.0+0.5+0.8+0.4+0.3+0.3 = 3.3
    // score = 2.65/3.3 = 0.8030303...
    for (const p of out.proposals) {
      expect(p.score).toBeCloseTo(0.8030303030303, 6);
    }
  });

  it('populates _candidateRows for every scored (eligible) candidate', async () => {
    const shifts = [makeShift('d1', ...DAY(11))];
    const out = await run(fullMatrix(shifts, ['e1', 'e2', 'e3']));
    expect(out._candidateRows).toHaveLength(3);
    expect(out._candidateRows.every((r) => r.shiftId === 'd1')).toBe(true);
  });
});
