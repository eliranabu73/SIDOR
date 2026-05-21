import type { EmployeeAvailabilityRule } from '@prisma/client';
import {
  splitShiftIntoLocalDays,
  parseLocalTimeToMinutes,
  minutesFromStartOfDay,
  overlapMinutes,
  type LocalSegment,
} from '../../shared/tz';

export interface AvailabilityCoverage {
  totalShiftMinutes: number;
  coveredMinutes: number;
  /** ratio in [0,1] — 1 = fully covered by AVAILABLE/PREFERRED windows */
  coverageRatio: number;
  blockedMinutes: number;
  /** any UNAVAILABLE rule overlaps any segment */
  hasExplicitUnavailable: boolean;
  segments: LocalSegment[];
}

/**
 * Pure function: given a shift window (UTC + tz) and the employee's recurring
 * availability rules, returns a coverage report. Boolean "is covered" =
 * `coverageRatio >= 1 && !hasExplicitUnavailable`.
 *
 * Per the spec, availability rules never cross midnight, so per-day matching is
 * a straightforward windowed overlap on minutes-from-midnight.
 */
export function computeAvailabilityCoverage(args: {
  startAtUtc: Date;
  endAtUtc: Date;
  timezone: string;
  rules: EmployeeAvailabilityRule[];
}): AvailabilityCoverage {
  const segments = splitShiftIntoLocalDays(args.startAtUtc, args.endAtUtc, args.timezone);
  let totalShiftMinutes = 0;
  let coveredMinutes = 0;
  let blockedMinutes = 0;
  let hasExplicitUnavailable = false;

  for (const seg of segments) {
    totalShiftMinutes += seg.durationMinutes;
    const segStartMin = minutesFromStartOfDay(seg.startLocal);
    const segEndMin = segStartMin + seg.durationMinutes;

    const dayRules = args.rules.filter((r) => r.dayOfWeek === seg.dayOfWeek);
    let segCovered = 0;

    for (const r of dayRules) {
      const rStart = parseLocalTimeToMinutes(r.startLocalTime);
      const rEnd = parseLocalTimeToMinutes(r.endLocalTime);
      const o = overlapMinutes(segStartMin, segEndMin, rStart, rEnd);
      if (o === 0) continue;

      if (r.availabilityType === 'UNAVAILABLE') {
        hasExplicitUnavailable = true;
        blockedMinutes += o;
      } else {
        // AVAILABLE or PREFERRED both count as coverage
        segCovered += o;
      }
    }
    // cap by segment length (overlapping rules shouldn't double-count)
    coveredMinutes += Math.min(segCovered, seg.durationMinutes);
  }

  const coverageRatio = totalShiftMinutes === 0 ? 0 : coveredMinutes / totalShiftMinutes;
  return {
    totalShiftMinutes,
    coveredMinutes,
    coverageRatio,
    blockedMinutes,
    hasExplicitUnavailable,
    segments,
  };
}
