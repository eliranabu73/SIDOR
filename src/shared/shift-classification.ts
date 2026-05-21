import { DateTime } from 'luxon';

/**
 * Classify a shift's local start time for metrics bucketing.
 * Mirrors the helper in assignments.service so multiple modules can share it
 * without circular imports.
 */
export function classifyShiftStartLocal(startAtUtc: Date, timezone: string) {
  const local = DateTime.fromJSDate(startAtUtc).setZone(timezone);
  const hour = local.hour;
  const dayOfWeek = local.weekday === 7 ? 0 : local.weekday; // 0=Sun..6=Sat
  return {
    isNight: hour >= 22 || hour < 6,
    isMorning: hour >= 6 && hour < 12,
    isEvening: hour >= 12 && hour < 22,
    isWeekend: dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0,
  };
}

export type ShiftClassification = ReturnType<typeof classifyShiftStartLocal>;

export function shiftMinutes(startAtUtc: Date, endAtUtc: Date): number {
  return Math.round((endAtUtc.getTime() - startAtUtc.getTime()) / 60000);
}

export function weekStartFor(startAtUtc: Date, timezone: string): Date {
  return DateTime.fromJSDate(startAtUtc).setZone(timezone).startOf('week').toJSDate();
}
