import {
  DEFAULT_WEIGHTS,
  type CandidateSignals,
  type ScoringWeights,
} from './types';

/**
 * Pure scoring: turn signals into a single composite in roughly [0, 1].
 *
 * Each signal is normalized to a "goodness" value where higher = better fit,
 * then weighted-averaged. The breakdown is returned alongside the total so
 * the UI can explain *why* one candidate beat another.
 */
export function scoreCandidate(
  signals: CandidateSignals,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  preferredWeeklyMinutes = 40 * 60,
): { score: number; breakdown: Record<keyof ScoringWeights, number> } {
  // availability: already in [0, 1]
  const availability = clamp01(signals.availabilityCoverage);

  // preference: linear remap [-10, 10] -> [0, 1]
  const preference = clamp01((signals.preferenceScore + 10) / 20);

  // fairness: a NEGATIVE fairness z-score means employee is under-scheduled →
  // we want to prefer them. Map [-3, 3] -> [1, 0].
  const fairness = clamp01((3 - signals.fairnessScore) / 6);

  // weekly hours balance: 1 when projected ≈ preferred, fades to 0 when off by
  // a full preferred-week. Bigger preferred → more tolerance.
  const weeklyHoursBalance = clamp01(
    1 - Math.min(1, Math.abs(signals.weeklyHoursDelta) / Math.max(60, preferredWeeklyMinutes)),
  );

  // weekend balance: penalty only when this IS a weekend shift AND the
  // employee already worked weekends this week.
  const weekendBalance = signals.isWeekendShift
    ? clamp01(1 - signals.weekendShiftCount / 3)
    : 1;

  // night balance: same idea — only penalize on night shifts.
  const nightBalance = signals.isNightShift
    ? clamp01(1 - signals.nightShiftCount / 3)
    : 1;

  const breakdown = {
    availability: availability * weights.availability,
    preference: preference * weights.preference,
    fairness: fairness * weights.fairness,
    weeklyHoursBalance: weeklyHoursBalance * weights.weeklyHoursBalance,
    weekendBalance: weekendBalance * weights.weekendBalance,
    nightBalance: nightBalance * weights.nightBalance,
  };

  const sumWeights =
    weights.availability +
    weights.preference +
    weights.fairness +
    weights.weeklyHoursBalance +
    weights.weekendBalance +
    weights.nightBalance;
  const weighted =
    breakdown.availability +
    breakdown.preference +
    breakdown.fairness +
    breakdown.weeklyHoursBalance +
    breakdown.weekendBalance +
    breakdown.nightBalance;

  const score = sumWeights > 0 ? weighted / sumWeights : 0;
  return { score, breakdown };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
