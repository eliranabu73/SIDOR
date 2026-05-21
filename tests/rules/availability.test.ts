import { availabilityRule } from '../../src/modules/rules/rules/availability.rule';
import {
  makeAvailability,
  makeContext,
  makeShift,
} from '../factories/fixtures';
import { computeAvailabilityCoverage } from '../../src/modules/availability/availability.service';

// Shift: Mon 06:00–14:00 UTC (= 09:00–17:00 Asia/Jerusalem, UTC+3)
const monShift = () =>
  makeShift({
    startAtUtc: new Date('2026-05-25T06:00:00Z'),
    endAtUtc: new Date('2026-05-25T14:00:00Z'),
    timezone: 'Asia/Jerusalem',
  });

describe('availabilityRule', () => {
  it('passes when an AVAILABLE window fully covers the shift', async () => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '08:00:00',
          endLocalTime: '18:00:00',
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
    expect(r.metadata?.coverageRatio).toBe(1);
  });

  it('blocks when only partial coverage', async () => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '09:00:00',
          endLocalTime: '13:00:00', // covers half the shift
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('AVAILABILITY_INSUFFICIENT');
    expect((r.metadata?.coverageRatio as number) ?? 0).toBeLessThan(1);
  });

  it('blocks when an UNAVAILABLE window overlaps', async () => {
    const ctx = makeContext({
      shift: monShift(),
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '00:00:00',
          endLocalTime: '23:59:00',
        }),
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '10:00:00',
          endLocalTime: '12:00:00',
          availabilityType: 'UNAVAILABLE',
        }),
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('failed');
    expect(r.ruleCode).toBe('AVAILABILITY_BLOCKED');
  });

  it('handles night shifts that span midnight via two split rules', async () => {
    // Night shift: Mon 19:00Z → Tue 03:00Z
    //   local Jerusalem: Mon 22:00 → Tue 06:00
    const night = makeShift({
      startAtUtc: new Date('2026-05-25T19:00:00Z'),
      endAtUtc: new Date('2026-05-26T03:00:00Z'),
      timezone: 'Asia/Jerusalem',
    });
    const ctx = makeContext({
      shift: night,
      availabilityRules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '22:00:00',
          endLocalTime: '23:59:59',
        }), // Mon tail
        makeAvailability({
          dayOfWeek: 2,
          startLocalTime: '00:00:00',
          endLocalTime: '06:00:00',
        }), // Tue head
      ],
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
  });

  it('skips when requireAvailability is false', async () => {
    const ctx = makeContext({
      availabilityRules: [],
      rulesSnapshot: {
        ...makeContext().rulesSnapshot,
        requireAvailability: false,
      },
    });
    const r = await availabilityRule(ctx);
    expect(r.status).toBe('passed');
  });
});

describe('computeAvailabilityCoverage', () => {
  it('returns coverageRatio between 0 and 1', () => {
    const c = computeAvailabilityCoverage({
      startAtUtc: new Date('2026-05-25T06:00:00Z'),
      endAtUtc: new Date('2026-05-25T14:00:00Z'),
      timezone: 'Asia/Jerusalem',
      rules: [
        makeAvailability({
          dayOfWeek: 1,
          startLocalTime: '09:00:00',
          endLocalTime: '13:00:00',
        }),
      ],
    });
    expect(c.coverageRatio).toBeGreaterThan(0);
    expect(c.coverageRatio).toBeLessThan(1);
  });
});
