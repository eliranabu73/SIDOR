import { validateAssignment } from '../../src/modules/rules/validator.service';
import {
  makeAvailability,
  makeContext,
  makeEmployee,
  makeEmployeeRole,
  makeShift,
  IDS,
} from '../factories/fixtures';

function happyPathCtx() {
  const employee = makeEmployee({});
  employee.roles = [makeEmployeeRole({ roleId: IDS.ROLE_ID })];
  return makeContext({
    employee,
    availabilityRules: [
      makeAvailability({
        dayOfWeek: 1,
        startLocalTime: '08:00:00',
        endLocalTime: '18:00:00',
      }),
    ],
  });
}

describe('validateAssignment', () => {
  it('returns allowed when every rule passes', async () => {
    const result = await validateAssignment(happyPathCtx());
    expect(result.outcome).toBe('allowed');
    expect(result.blocking).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns blocked when any rule has blocking failure', async () => {
    const ctx = happyPathCtx();
    ctx.employee.isActive = false;
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blocking.length).toBeGreaterThan(0);
    expect(result.blocking[0]!.ruleCode).toBe('EMPLOYEE_INACTIVE');
  });

  it('returns allowed_with_warnings when only warnings present', async () => {
    const ctx = happyPathCtx();
    // 10h shift triggers OVERTIME_DAILY warning
    ctx.shift = makeShift({
      ...ctx.shift,
      startAtUtc: new Date('2026-05-25T05:00:00Z'),
      endAtUtc: new Date('2026-05-25T15:00:00Z'),
    });
    ctx.availabilityRules = [
      makeAvailability({
        dayOfWeek: 1,
        startLocalTime: '07:00:00',
        endLocalTime: '19:00:00',
      }),
    ];
    const result = await validateAssignment(ctx);
    expect(result.outcome).toBe('allowed_with_warnings');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.blocking).toHaveLength(0);
  });
});
