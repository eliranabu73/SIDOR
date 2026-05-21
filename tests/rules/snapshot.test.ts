import {
  mergeRulesSnapshot,
  parseLaborRulesJson,
} from '../../src/modules/rules/snapshot.service';
import { SYSTEM_DEFAULT_RULES } from '../../src/modules/rules/types';

describe('mergeRulesSnapshot', () => {
  it('returns system defaults when no overrides', () => {
    expect(mergeRulesSnapshot(null, null)).toEqual(SYSTEM_DEFAULT_RULES);
  });

  it('location rules win over org rules', () => {
    const merged = mergeRulesSnapshot(
      { maxHoursPerDay: 10 },
      { maxHoursPerDay: 14 },
    );
    expect(merged.maxHoursPerDay).toBe(14);
  });

  it('explicit overrides win over both', () => {
    const merged = mergeRulesSnapshot(
      { maxHoursPerDay: 10 },
      { maxHoursPerDay: 14 },
      { maxHoursPerDay: 6 },
    );
    expect(merged.maxHoursPerDay).toBe(6);
  });
});

describe('parseLaborRulesJson', () => {
  it('accepts camelCase keys', () => {
    expect(parseLaborRulesJson({ maxHoursPerDay: 9 })).toEqual({
      maxHoursPerDay: 9,
    });
  });
  it('accepts snake_case keys from the spec doc', () => {
    expect(parseLaborRulesJson({ max_hours_per_day: 9 })).toEqual({
      maxHoursPerDay: 9,
    });
  });
  it('ignores non-object input', () => {
    expect(parseLaborRulesJson(null)).toEqual({});
    expect(parseLaborRulesJson('nope')).toEqual({});
  });
});
