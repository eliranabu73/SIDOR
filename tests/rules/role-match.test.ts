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

  it('blocks even when requireRoleMatch is true and employee has NO roles at all', async () => {
    const employee = makeEmployee({});
    employee.roles = [];
    const result = await roleMatchRule(makeContext({ employee }));
    expect(result.status).toBe('failed');
    expect(result.ruleCode).toBe('ROLE_NOT_HELD');
    expect(result.severity).toBe('blocking');
  });

  it('passes when employee holds the required role among several', async () => {
    const employee = makeEmployee({});
    employee.roles = [
      makeEmployeeRole({ roleId: 'role-cook' }),
      makeEmployeeRole({ roleId: IDS.ROLE_ID }),
      makeEmployeeRole({ roleId: 'role-host' }),
    ];
    const result = await roleMatchRule(makeContext({ employee }));
    expect(result.status).toBe('passed');
    expect(result.ruleCode).toBe('ROLE_MATCH');
  });

  it('blocks when employee holds several roles but none is the required one', async () => {
    const employee = makeEmployee({});
    employee.roles = [
      makeEmployeeRole({ roleId: 'role-cook' }),
      makeEmployeeRole({ roleId: 'role-host' }),
    ];
    const result = await roleMatchRule(makeContext({ employee }));
    expect(result.status).toBe('failed');
    expect(result.ruleCode).toBe('ROLE_NOT_HELD');
  });

  it('exposes the required role id in metadata when it blocks', async () => {
    const shift = makeShift({ roleId: 'manager-role' });
    const employee = makeEmployee({});
    employee.roles = [makeEmployeeRole({ roleId: 'waiter-role' })];
    const result = await roleMatchRule(makeContext({ shift, employee }));
    expect(result.status).toBe('failed');
    expect(result.metadata).toEqual({ requiredRoleId: 'manager-role' });
  });

  describe('manager-role shift only accepts a manager', () => {
    const MANAGER = 'manager-role';
    const managerShift = () => makeShift({ roleId: MANAGER });

    it('a manager passes the manager-role shift', async () => {
      const manager = makeEmployee({});
      manager.roles = [makeEmployeeRole({ roleId: MANAGER })];
      const result = await roleMatchRule(
        makeContext({ shift: managerShift(), employee: manager }),
      );
      expect(result.status).toBe('passed');
    });

    it('a plain waiter is blocked from the manager-role shift', async () => {
      const waiter = makeEmployee({});
      waiter.roles = [makeEmployeeRole({ roleId: 'waiter-role' })];
      const result = await roleMatchRule(
        makeContext({ shift: managerShift(), employee: waiter }),
      );
      expect(result.status).toBe('failed');
      expect(result.severity).toBe('blocking');
      expect(result.metadata).toEqual({ requiredRoleId: MANAGER });
    });

    it('a multi-role employee who also holds manager passes', async () => {
      const senior = makeEmployee({});
      senior.roles = [
        makeEmployeeRole({ roleId: 'waiter-role' }),
        makeEmployeeRole({ roleId: MANAGER, isPrimary: true }),
      ];
      const result = await roleMatchRule(
        makeContext({ shift: managerShift(), employee: senior }),
      );
      expect(result.status).toBe('passed');
    });
  });

  // table-driven eligibility matrix
  it.each([
    { name: 'exact match', shiftRole: 'r-A', empRoles: ['r-A'], expected: 'passed' },
    { name: 'no match', shiftRole: 'r-A', empRoles: ['r-B'], expected: 'failed' },
    { name: 'match in set', shiftRole: 'r-A', empRoles: ['r-B', 'r-A'], expected: 'passed' },
    { name: 'empty roles', shiftRole: 'r-A', empRoles: [], expected: 'failed' },
    { name: 'case-sensitive mismatch', shiftRole: 'r-A', empRoles: ['r-a'], expected: 'failed' },
  ])('eligibility matrix: $name -> $expected', async ({ shiftRole, empRoles, expected }) => {
    const employee = makeEmployee({});
    employee.roles = empRoles.map((roleId) => makeEmployeeRole({ roleId }));
    const result = await roleMatchRule(
      makeContext({ shift: makeShift({ roleId: shiftRole }), employee }),
    );
    expect(result.status).toBe(expected);
  });
});
