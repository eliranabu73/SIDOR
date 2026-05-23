import type {
  RuleFn,
  RuleResult,
  ValidationContext,
  ValidationResult,
} from './types';
import { employeeActiveRule } from './rules/employee-active.rule';
import { roleMatchRule } from './rules/role-match.rule';
import { availabilityRule } from './rules/availability.rule';
import { overlapRule } from './rules/overlap.rule';
import { minRestRule } from './rules/min-rest.rule';
import { maxHoursDayRule } from './rules/max-hours-day.rule';
import { maxHoursWeekRule } from './rules/max-hours-week.rule';
import { shiftNotLockedRule } from './rules/shift-not-locked.rule';
import { youthNightCurfewRule } from './rules/youth-night-curfew.rule';
import { youthMaxHoursRule } from './rules/youth-max-hours.rule';
import { weeklyRest36hRule } from './rules/weekly-rest-36h.rule';
import { break45MinRule } from './rules/break-45min.rule';
import { overtimeTiersRule } from './rules/overtime-tiers.rule';

export const FAST_RULES: ReadonlyArray<{ name: string; fn: RuleFn }> = [
  { name: 'employeeActive', fn: employeeActiveRule },
  { name: 'roleMatch', fn: roleMatchRule },
  { name: 'availability', fn: availabilityRule },
  { name: 'overlap', fn: overlapRule },
  { name: 'minRest', fn: minRestRule },
  { name: 'maxHoursDay', fn: maxHoursDayRule },
  { name: 'maxHoursWeek', fn: maxHoursWeekRule },
  { name: 'shiftNotLocked', fn: shiftNotLockedRule },
  // WS-E: IL compliance engine
  { name: 'youthNightCurfew', fn: youthNightCurfewRule },
  { name: 'youthMaxHours', fn: youthMaxHoursRule },
  { name: 'weeklyRest36h', fn: weeklyRest36hRule },
  { name: 'break45Min', fn: break45MinRule },
  { name: 'overtimeTiers', fn: overtimeTiersRule },
];

export async function validateAssignment(
  ctx: ValidationContext,
): Promise<ValidationResult> {
  const results = await Promise.all(
    FAST_RULES.map(async (r) => {
      try {
        return await r.fn(ctx);
      } catch (err) {
        return {
          ruleCode: `RULE_ERROR:${r.name}`,
          status: 'failed',
          severity: 'blocking',
          message: err instanceof Error ? err.message : 'Unknown rule error',
        } satisfies RuleResult;
      }
    }),
  );

  const failed = results.filter((r) => r.status === 'failed');
  const blocking = failed.filter((r) => r.severity === 'blocking');
  const warnings = failed.filter((r) => r.severity === 'warning');

  let outcome: ValidationResult['outcome'];
  if (blocking.length > 0) outcome = 'blocked';
  else if (warnings.length > 0) outcome = 'allowed_with_warnings';
  else outcome = 'allowed';

  return { outcome, results, blocking, warnings };
}
