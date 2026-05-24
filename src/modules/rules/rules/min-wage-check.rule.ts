import type { RuleFn, RuleResult } from '../types';

/**
 * IL Minimum Wage Check.
 *
 * As of 01.04.2026: ₪35.40/hour (updated per Histadrut agreement, +3.3%).
 * Previous: ₪34.32/hour (01.04.2025).
 *
 * This rule emits a WARNING (not blocking) when the employee's hourlyRate
 * is below the statutory minimum. A collective agreement may justify a
 * higher effective rate, but a raw hourlyRate below minimum is a red flag.
 *
 * Amounts are in ILS (shekels). Update MIN_WAGE_PER_HOUR when the rate
 * changes (typically April 1 each year per Knesset legislation schedule).
 */

// ₪35.40/hour from 01.04.2026
const MIN_WAGE_PER_HOUR = 35.40;
const EFFECTIVE_FROM = '2026-04-01';

export const minWageCheckRule: RuleFn = (ctx): RuleResult => {
  const { employee } = ctx;

  if (employee.hourlyRate == null) {
    return { ruleCode: 'MIN_WAGE_CHECK', status: 'passed', severity: 'info' };
  }

  const rate = Number(employee.hourlyRate);

  if (rate < MIN_WAGE_PER_HOUR) {
    return {
      ruleCode: 'MIN_WAGE_CHECK',
      status: 'failed',
      severity: 'warning',
      message: `שכר שעתי (₪${rate.toFixed(2)}) נמוך משכר המינימום הנוכחי (₪${MIN_WAGE_PER_HOUR.toFixed(2)}/שעה מ-${EFFECTIVE_FROM}).`,
      metadata: { employeeHourlyRate: rate, minWagePerHour: MIN_WAGE_PER_HOUR, effectiveFrom: EFFECTIVE_FROM },
    };
  }

  return { ruleCode: 'MIN_WAGE_CHECK', status: 'passed', severity: 'info' };
};
