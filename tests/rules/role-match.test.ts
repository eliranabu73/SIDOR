import { roleMatchRule } from '../../src/modules/rules/rules/role-match.rule';
import {
  makeContext,
  makeEmployee,
  makeEmployeeRole,
  makeShift,
  IDS,
} from '../factories/fixtures';

describe('roleMatchRule', () => {
  it('passes when employee holds the required role', async () => {
    const employee = makeEmployee({});
    employee.roles = [makeEmployeeRole({ roleId: IDS.ROLE_ID })];
    const result = await roleMatchRule(makeContext({ employee }));
    expect(result.status).toBe('passed');
  });

  it('blocks when employee lacks the required role', async () => {
    const employee = makeEmployee({});
    employee.roles = [makeEmployeeRole({ roleId: 'other-role' })];
    const result = await roleMatchRule(makeContext({ employee }));
    expect(result.status).toBe('failed');
    expect(result.severity).toBe('blocking');
    expect(result.ruleCode).toBe('ROLE_NOT_HELD');
  });

  it('skips when shift has no role', async () => {
    const ctx = makeContext({ shift: makeShift({ roleId: null }) });
    const result = await roleMatchRule(ctx);
    expect(result.status).toBe('passed');
  });

  it('skips when requireRoleMatch is false', async () => {
    const ctx = makeContext({
      rulesSnapshot: {
        ...makeContext().rulesSnapshot,
        requireRoleMatch: false,
      },
    });
    const result = await roleMatchRule(ctx);
    expect(result.status).toBe('passed');
  });
});
