import { overlapRule } from '../../src/modules/rules/rules/overlap.rule';
import {
  makeAssignment,
  makeContext,
  makeShift,
} from '../factories/fixtures';

describe('overlapRule', () => {
  it('passes when no other assignments', async () => {
    const r = await overlapRule(makeContext({ existingAssignments: [] }));
    expect(r.status).toBe('passed');
  });

  it('blocks when an active assignment overlaps', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T08:00:00Z'),
      endAtUtc: new Date('2026-05-25T16:00:00Z'),
    });
    const ctx = makeContext({
      shift: candidate,
      existingAssignments: [
        makeAssignment({
          shift: {
            id: 'other',
            startAtUtc: new Date('2026-05-25T10:00:00Z'),
            endAtUtc: new Date('2026-05-25T12:00:00Z'),
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('SHIFT_OVERLAP');
  });

  it('ignores cancelled assignments', async () => {
    const candidate = makeShift({
      id: 'cand',
      startAtUtc: new Date('2026-05-25T08:00:00Z'),
      endAtUtc: new Date('2026-05-25T16:00:00Z'),
    });
    const ctx = makeContext({
      shift: candidate,
      existingAssignments: [
        makeAssignment({
          assignmentStatus: 'CANCELLED',
          shift: {
            id: 'other',
            startAtUtc: new Date('2026-05-25T10:00:00Z'),
            endAtUtc: new Date('2026-05-25T12:00:00Z'),
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('passes when same shift is in the list (re-assignment idempotency)', async () => {
    const candidate = makeShift({ id: 'same' });
    const ctx = makeContext({
      shift: candidate,
      existingAssignments: [
        makeAssignment({
          shiftId: 'same',
          shift: {
            id: 'same',
            startAtUtc: candidate.startAtUtc,
            endAtUtc: candidate.endAtUtc,
          },
        }),
      ],
    });
    const r = await overlapRule(ctx);
    expect(r.status).toBe('passed');
  });
});
