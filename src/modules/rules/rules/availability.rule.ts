import type { RuleFn, RuleResult } from '../types';
import { computeAvailabilityCoverage } from '../../availability/availability.service';

export const availabilityRule: RuleFn = (ctx): RuleResult => {
  const { shift, availabilityRules, rulesSnapshot } = ctx;

  if (!rulesSnapshot.requireAvailability) {
    return {
      ruleCode: 'AVAILABILITY_SKIPPED',
      status: 'passed',
      severity: 'info',
    };
  }

  // No availability rules defined → employee is assumed fully available.
  if (availabilityRules.length === 0) {
    return {
      ruleCode: 'AVAILABILITY_OK',
      status: 'passed',
      severity: 'info',
      metadata: { coverageRatio: 1, note: 'no_rules_defined' },
    };
  }

  const coverage = computeAvailabilityCoverage({
    startAtUtc: shift.startAtUtc,
    endAtUtc: shift.endAtUtc,
    timezone: shift.timezone,
    rules: availabilityRules,
  });

  if (coverage.hasExplicitUnavailable) {
    return {
      ruleCode: 'AVAILABILITY_BLOCKED',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee has an UNAVAILABLE window overlapping this shift.',
      metadata: {
        coverageRatio: coverage.coverageRatio,
        blockedMinutes: coverage.blockedMinutes,
      },
    };
  }
  if (coverage.coverageRatio < 1) {
    return {
      ruleCode: 'AVAILABILITY_INSUFFICIENT',
      status: 'failed',
      severity: 'blocking',
      message: 'Employee is not fully available for the shift window.',
      metadata: {
        coverageRatio: coverage.coverageRatio,
        coveredMinutes: coverage.coveredMinutes,
        totalShiftMinutes: coverage.totalShiftMinutes,
      },
    };
  }
  return {
    ruleCode: 'AVAILABILITY_OK',
    status: 'passed',
    severity: 'info',
    metadata: { coverageRatio: 1 },
  };
};
