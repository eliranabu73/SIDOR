import { shiftNotLockedRule } from '../../src/modules/rules/rules/shift-not-locked.rule';
import { makeContext } from '../factories/fixtures';

describe('shiftNotLockedRule', () => {
  it('passes when no lock', async () => {
    const r = await shiftNotLockedRule(makeContext({ activeLockUserId: null }));
    expect(r.status).toBe('passed');
  });

  it('passes when the lock is held by the acting user', async () => {
    const r = await shiftNotLockedRule(
      makeContext({ activeLockUserId: 'user-1', actingUserId: 'user-1' }),
    );
    expect(r.status).toBe('passed');
  });

  it('blocks when another user holds the lock', async () => {
    const r = await shiftNotLockedRule(
      makeContext({ activeLockUserId: 'user-2', actingUserId: 'user-1' }),
    );
    expect(r.status).toBe('failed');
    expect(r.severity).toBe('blocking');
    expect(r.ruleCode).toBe('SHIFT_LOCKED');
  });
});
