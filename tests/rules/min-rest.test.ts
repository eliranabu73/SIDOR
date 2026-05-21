import { minRestRule } from '../../src/modules/rules/rules/min-rest.rule';
import {
  makeAssignment,
  makeContext,
  makeShift,
} from '../factories/fixtures';

const HOUR = 3600 * 1000;

describe('minRestRule', () => {
  it('passes when prior shift ended well before candidate', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T20:00:00Z'),
      endAtUtc: new Date('2026-05-26T04:00:00Z'),
    });
    const prior = makeAssignment({
      shift: {
        id: 'p',
        startAtUtc: new Date('2026-05-25T06:00:00Z'),
        endAtUtc: new Date('2026-05-25T11:00:00Z'),
      },
    });
    const r = await minRestRule(
      makeContext({ shift: candidate, existingAssignments: [prior] }),
    );
    expect(r.status).toBe('passed');
  });

  it('blocks when prior ended < min-rest before candidate', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T15:00:00Z'),
      endAtUtc: new Date('2026-05-25T23:00:00Z'),
    });
    const prior = makeAssignment({
      shift: {
        id: 'p',
        startAtUtc: new Date('2026-05-25T05:00:00Z'),
        endAtUtc: new Date('2026-05-25T13:00:00Z'),
      },
    });
    // 2h gap, default min-rest is 8h
    const r = await minRestRule(
      makeContext({ shift: candidate, existingAssignments: [prior] }),
    );
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('MIN_REST_BETWEEN_SHIFTS');
    expect(r.metadata?.actualRestHours).toBeLessThan(8);
  });

  it('ignores overlapping shifts (handled by overlapRule)', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T08:00:00Z'),
      endAtUtc: new Date('2026-05-25T16:00:00Z'),
    });
    const overlap = makeAssignment({
      shift: {
        id: 'o',
        startAtUtc: new Date('2026-05-25T10:00:00Z'),
        endAtUtc: new Date('2026-05-25T12:00:00Z'),
      },
    });
    const r = await minRestRule(
      makeContext({ shift: candidate, existingAssignments: [overlap] }),
    );
    expect(r.status).toBe('passed');
  });

  it('treats next-shift gap symmetrically', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T06:00:00Z'),
      endAtUtc: new Date('2026-05-25T14:00:00Z'),
    });
    const next = makeAssignment({
      shift: {
        id: 'n',
        startAtUtc: new Date('2026-05-25T16:00:00Z'),
        endAtUtc: new Date('2026-05-25T20:00:00Z'),
      },
    });
    // 2h gap forward
    const r = await minRestRule(
      makeContext({ shift: candidate, existingAssignments: [next] }),
    );
    expect(r.status).toBe('failed');
  });

  it('respects rulesSnapshot.minRestHoursBetweenShifts', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T15:00:00Z'),
      endAtUtc: new Date('2026-05-25T23:00:00Z'),
    });
    const prior = makeAssignment({
      shift: {
        id: 'p',
        startAtUtc: new Date('2026-05-25T05:00:00Z'),
        endAtUtc: new Date('2026-05-25T13:00:00Z'),
      },
    });
    const r = await minRestRule(
      makeContext({
        shift: candidate,
        existingAssignments: [prior],
        rulesSnapshot: {
          ...makeContext().rulesSnapshot,
          minRestHoursBetweenShifts: 1, // 2h gap → still passes
        },
      }),
    );
    expect(r.status).toBe('passed');
    // sanity check HOUR is referenced (for ts strict noUnusedLocals if enabled)
    expect(HOUR).toBe(3_600_000);
  });
});
