import type { RuleFn, RuleResult } from '../types';

/**
 * IL Break Requirement (WS-E).
 *
 * A shift longer than 6 hours must include at least one break of ≥45 minutes.
 * If the candidate shift has no break data loaded in context, we emit a
 * WARNING (soft) rather than blocking — caller may not have hydrated breaks.
 */
const LONG_SHIFT_MINUTES = 6 * 60;
const REQUIRED_BREAK_MINUTES = 45;

interface ShiftWithBreaks {
  breaks?: Array<{ durationMinutes: number }>;
}

export const break45MinRule: RuleFn = (ctx): RuleResult => {
  const { shift } = ctx;
  const shiftMinutes = Math.round(
    (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60000,
  );

  if (shiftMinutes <= LONG_SHIFT_MINUTES) {
    return {
      ruleCode: 'BREAK_45_MIN',
      status: 'passed',
      severity: 'info',
    };
  }

  const breaks = (shift as ShiftWithBreaks).breaks;
  if (!Array.isArray(breaks)) {
    // No break data hydrated → soft warning so it surfaces without blocking.
    return {
      ruleCode: 'BREAK_45_MIN_UNKNOWN',
      status: 'failed',
      severity: 'warning',
      message: 'משמרת מעל 6 שעות — לא נמצאו נתוני הפסקה; ודא הפסקה של 45 דקות לפחות.',
      metadata: { shiftMinutes },
    };
  }

  const hasQualifyingBreak = breaks.some(
    (b) => (b.durationMinutes ?? 0) >= REQUIRED_BREAK_MINUTES,
  );
  if (!hasQualifyingBreak) {
    return {
      ruleCode: 'BREAK_45_MIN',
      status: 'failed',
      severity: 'warning',
      message: 'משמרת מעל 6 שעות חייבת לכלול הפסקה של 45 דקות לפחות.',
      metadata: {
        shiftMinutes,
        breaks: breaks.map((b) => b.durationMinutes ?? 0),
        requiredMinutes: REQUIRED_BREAK_MINUTES,
      },
    };
  }

  return {
    ruleCode: 'BREAK_45_MIN',
    status: 'passed',
    severity: 'info',
  };
};
