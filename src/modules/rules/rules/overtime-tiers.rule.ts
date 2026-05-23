import type { RuleFn, RuleResult } from '../types';

/**
 * IL Overtime Tiers (WS-E) — informational only.
 *
 * IL labor law breaks daily overtime into tiers:
 *   - First 8 hours: regular pay (100%).
 *   - Next 2 hours (8→10): 125%.
 *   - Beyond 10 hours: 150%.
 *
 * This rule never blocks. It emits an INFO RuleResult so downstream
 * labor-cost calculations can pick up the tiering metadata.
 */
const REGULAR_MINUTES = 8 * 60;
const TIER_125_MINUTES = 10 * 60;

export const overtimeTiersRule: RuleFn = (ctx): RuleResult => {
  const { shift } = ctx;
  const shiftMinutes = Math.round(
    (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60000,
  );

  if (shiftMinutes <= REGULAR_MINUTES) {
    return {
      ruleCode: 'OVERTIME_TIERS',
      status: 'passed',
      severity: 'info',
      message: 'משמרת ללא שעות נוספות.',
      metadata: {
        regularMinutes: shiftMinutes,
        tier125Minutes: 0,
        tier150Minutes: 0,
      },
    };
  }

  const tier125 = Math.min(shiftMinutes, TIER_125_MINUTES) - REGULAR_MINUTES;
  const tier150 = Math.max(0, shiftMinutes - TIER_125_MINUTES);

  return {
    ruleCode: 'OVERTIME_TIERS',
    status: 'passed',
    severity: 'info',
    message: `שעות נוספות: ${(tier125 / 60).toFixed(1)} שעות ב-125%, ${(tier150 / 60).toFixed(1)} שעות ב-150%.`,
    metadata: {
      regularMinutes: REGULAR_MINUTES,
      tier125Minutes: tier125,
      tier150Minutes: tier150,
    },
  };
};
