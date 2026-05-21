import { employeeActiveRule } from '../../src/modules/rules/rules/employee-active.rule';
import { makeContext, makeEmployee, makeShift, IDS } from '../factories/fixtures';

describe('employeeActiveRule', () => {
  it('passes when employee is active and same org', async () => {
    const result = await employeeActiveRule(makeContext());
    expect(result.status).toBe('passed');
    expect(result.ruleCode).toBe('EMPLOYEE_ACTIVE');
  });

  it('blocks when employee inactive', async () => {
    const ctx = makeContext({ employee: makeEmployee({ isActive: false }) });
    const result = await employeeActiveRule(ctx);
    expect(result.status).toBe('failed');
    expect(result.severity).toBe('blocking');
    expect(result.ruleCode).toBe('EMPLOYEE_INACTIVE');
  });

  it('blocks when employee belongs to a different org', async () => {
    const ctx = makeContext({
      employee: makeEmployee({ organizationId: 'different-org' }),
      shift: makeShift({ organizationId: IDS.ORG_ID }),
    });
    const result = await employeeActiveRule(ctx);
    expect(result.status).toBe('failed');
    expect(result.ruleCode).toBe('EMPLOYEE_WRONG_ORG');
  });
});
