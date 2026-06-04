/**
 * validateAssignment orchestration EDGE cases.
 *
 * Starts from a clean "happy path" context (6h shift, role held, available),
 * then perturbs ONE dimension at a time to assert outcome aggregation:
 *  - any blocking failure ⇒ 'blocked' (regardless of warnings)
 *  - only warnings ⇒ 'allowed_with_warnings'
 *  - no failures ⇒ 'allowed'
 *  - a throwing rule degrades to a synthetic RULE_ERROR blocking result.
 */
import { validateAssignment, FAST_RULES } from '../../src/modules/rules/validator.service';
import {
  makeAvailability,
  makeContext,
  makeEmployee,
  makeEmployeeRole,
  makeMetrics,
  makeShift,
  makeTimeOff,
  IDS,
} from '../factories/fixtures';

function happyPathCtx() {
  const employee = makeEmployee({});
  employee.roles = [makeEmployeeRole({ roleId: IDS.ROLE_ID })];
  // 6h shift (≤360 min) so break-45min never warns; local 09:00–15:00 IDT.
  const shift = makeShift({
    startAtUtc: new Date('2026-05-25T06:00:00Z'),
    endAtUtc: new Date('2026-05-25T12:00:00Z'),
  });
  return makeContext({
    shift,
    employee,
    availabilityRules: [
      makeAvailability({ dayOfWeek: 1, startLocalTime: '08:00:00', endLocalTime: '18:00:00' }),
    ],
    metrics: makeMetrics({ totalScheduledMinutes: 0 }),
  });
}

describe('validateAssignment — orchestration edges', () => {
  it('baseline happy path is allowed with no blocking/warnings', async () => {
    const result = await validateAssignment(happyPathCtx());
    expect(result.outcome).toBe('allowed');
    expect(result.blocking).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('time-off overlap ⇒ blocked, TIME_OFF_BLOCKED present in blocking', async () => {
    const ctx = happyPathCtx();
    ctx.timeOffRequests = [
      makeTimeOff({
        status: 'APPROVED',
        startAtUtc: new Date('2026-05-25T06:00:00Z'),
        endAtUtc: new Date('2026-05-25T12:00:00Z'),
      }),
    ];
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.map((b) => b.ruleCode)).toContain('TIME_OFF_BLOCKED');
  });

  it('role not held ⇒ blocked with ROLE_NOT_HELD', async () => {
    const ctx = happyPathCtx();
    ctx.employee.roles = []; // no roles, shift requires ROLE_ID
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.map((b) => b.ruleCode)).toContain('ROLE_NOT_HELD');
  });

  it('locked by another user ⇒ blocked with SHIFT_LOCKED', async () => {
    const ctx = happyPathCtx();
    ctx.activeLockUserId = 'someone-else';
    ctx.actingUserId = 'me';
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.map((b) => b.ruleCode)).toContain('SHIFT_LOCKED');
  });

  it('blocking + warning together ⇒ blocked wins', async () => {
    const ctx = happyPathCtx();
    // Make weekly overtime (warning) AND inactive employee (blocking) coexist.
    ctx.employee = makeEmployee({ isActive: false });
    ctx.employee.roles = [makeEmployeeRole({ roleId: IDS.ROLE_ID })];
    ctx.metrics = makeMetrics({ totalScheduledMinutes: 2520 }); // 42h + 6h shift > 42h overtime
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.length).toBeGreaterThan(0);
  });

  it('only weekly overtime ⇒ allowed_with_warnings (no blocking)', async () => {
    const ctx = happyPathCtx();
    // 42h prior + 6h = 48h... that would BLOCK (>45h). Use 36h prior:
    // 36h=2160 + 360 = 2520 = 42h exactly = not over overtime → clean.
    // Use 37h prior: 2220 + 360 = 2580 = 43h > 42h overtime, < 45h max.
    ctx.metrics = makeMetrics({ totalScheduledMinutes: 2220 });
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('allowed_with_warnings');
    expect(result.blocking).toHaveLength(0);
    expect(result.warnings.map((w) => w.ruleCode)).toContain('OVERTIME_WEEKLY');
  });

  it('weekly hours exactly at 45h max ⇒ not blocked (warning tier only)', async () => {
    const ctx = happyPathCtx();
    // 39h prior (2340) + 6h = 45h exactly. Strict > → not blocked.
    ctx.metrics = makeMetrics({ totalScheduledMinutes: 2340 });
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('allowed_with_warnings');
    expect(result.blocking).toHaveLength(0);
  });

  it('weekly hours 45h01m ⇒ blocked with MAX_HOURS_PER_WEEK', async () => {
    const ctx = happyPathCtx();
    ctx.metrics = makeMetrics({ totalScheduledMinutes: 2341 }); // +6h = 2701 > 2700
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.map((b) => b.ruleCode)).toContain('MAX_HOURS_PER_WEEK');
  });

  it('a rule that throws degrades to a RULE_ERROR blocking result', async () => {
    const ctx = happyPathCtx();
    // Force availability service to throw via an invalid timezone on the shift.
    ctx.shift = makeShift({ ...ctx.shift, timezone: 'Not/AZone' });
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.some((b) => b.ruleCode.startsWith('RULE_ERROR'))).toBe(true);
  });

  it('results array contains one entry per registered rule', async () => {
    const result = await validateAssignment(happyPathCtx());
    // Self-correcting: one result per registered rule.
    expect(result.results.length).toBe(FAST_RULES.length);
  });

  it('a throwing rule yields a blocking RULE_ERROR AND is logged to console.error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = happyPathCtx();
      // Invalid timezone forces the availability rule path to throw.
      ctx.shift = makeShift({ ...ctx.shift, timezone: 'Not/AZone' });
      const result = await validateAssignment(ctx);

      // Fails safe: still a blocking RULE_ERROR result.
      const ruleError = result.results.find((r) => r.ruleCode.startsWith('RULE_ERROR'));
      expect(ruleError).toBeDefined();
      expect(ruleError!.severity).toBe('blocking');
      expect(ruleError!.status).toBe('failed');
      // Metadata carries the rule name + error message for diagnosis.
      expect(ruleError!.metadata?.rule).toBeDefined();
      expect(typeof ruleError!.metadata?.error).toBe('string');
      expect(result.outcome).toBe('blocked');

      // The code bug was surfaced, not silently swallowed.
      expect(spy).toHaveBeenCalled();
      const loggedRuleError = spy.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('RULE_ERROR'),
      );
      expect(loggedRuleError).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
