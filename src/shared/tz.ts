import { DateTime, Interval } from 'luxon';

export interface LocalSegment {
  dayOfWeek: number;          // 0..6 (0 = Sunday)
  startLocal: DateTime;       // local DateTime in the shift's TZ
  endLocal: DateTime;
  durationMinutes: number;
}

/**
 * Splits a UTC shift window into per-local-day segments in the given timezone.
 * Used by availability + max-hours-per-day rules so callers never deal with
 * midnight-crossing logic — the splitter handles it once.
 */
export function splitShiftIntoLocalDays(
  startAtUtc: Date,
  endAtUtc: Date,
  timezone: string,
): LocalSegment[] {
  const start = DateTime.fromJSDate(startAtUtc, { zone: 'utc' }).setZone(timezone);
  const end = DateTime.fromJSDate(endAtUtc, { zone: 'utc' }).setZone(timezone);
  if (!start.isValid || !end.isValid) {
    throw new Error(`Invalid timezone or instant: ${timezone}`);
  }
  if (end <= start) return [];

  const segments: LocalSegment[] = [];
  let cursor = start;
  while (cursor < end) {
    const dayEnd = cursor.endOf('day').plus({ milliseconds: 1 }); // next midnight
    const segEnd = dayEnd < end ? dayEnd : end;
    const duration = Math.round(segEnd.diff(cursor, 'minutes').minutes);
    segments.push({
      dayOfWeek: luxonWeekdayToSundayBased(cursor.weekday),
      startLocal: cursor,
      endLocal: segEnd,
      durationMinutes: duration,
    });
    cursor = segEnd;
  }
  return segments;
}

/** luxon: 1=Mon..7=Sun → 0=Sun..6=Sat */
export function luxonWeekdayToSundayBased(luxonWeekday: number): number {
  return luxonWeekday === 7 ? 0 : luxonWeekday;
}

/** Parse "HH:mm" or "HH:mm:ss" into total minutes from midnight (rounded). */
export function parseLocalTimeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  // round to nearest whole minute: lets "23:59:59" act as end-of-day (1440)
  return Math.round(h * 60 + m + s / 60);
}

/** Minutes from start-of-local-day for a DateTime. */
export function minutesFromStartOfDay(dt: DateTime): number {
  return dt.hour * 60 + dt.minute + dt.second / 60;
}

/** Overlap of two [aStart,aEnd) and [bStart,bEnd) in minutes (≥0). */
export function overlapMinutes(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Half-open interval overlap on Date instants. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export { Interval };
