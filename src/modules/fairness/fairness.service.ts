import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import { DateTime } from 'luxon';

/**
 * Fairness Engine — compares each employee against the team median across
 * five axes: hours, weekend shifts, night shifts, closing shifts, consecutive
 * closings. Surfaces who's been over/under-loaded so managers can rebalance.
 *
 * Window: last `weeks` complete weeks (default 4). Org-scoped.
 */
const WEEKEND_DAYS = new Set([5, 6]); // Friday + Saturday (Luxon: Mon=1..Sun=7 — but we use weekday num)

function isWeekend(d: DateTime): boolean {
  // Luxon weekday: Mon=1 .. Sun=7. Israeli weekend = Fri(5) & Sat(6).
  return WEEKEND_DAYS.has(d.weekday);
}

function isNightShift(start: DateTime, end: DateTime): boolean {
  // Heuristic: starts at/after 22:00 local OR crosses midnight
  if (start.hour >= 22) return true;
  if (end.day !== start.day) return true;
  return false;
}

function isClosingShift(end: DateTime): boolean {
  // Closing = ends after 22:00 local (or after midnight)
  return end.hour >= 22 || end.hour < 6;
}

export async function fetchFairness(
  input: {
    organizationId: string;
    weeks?: number;
  },
  db: Db = defaultPrisma,
) {
  const weeks = input.weeks ?? 4;
  const tz = 'Asia/Jerusalem';
  const now = DateTime.now().setZone(tz);
  const windowStart = now.minus({ weeks }).startOf('day');

  const assignments = await db.shiftAssignment.findMany({
    where: {
      assignmentStatus: { in: ['CONFIRMED', 'COMPLETED'] },
      shift: {
        organizationId: input.organizationId,
        status: { not: 'CANCELLED' },
        startAtUtc: { gte: windowStart.toUTC().toJSDate() },
      },
    },
    include: {
      employee: { select: { id: true, fullName: true, isActive: true } },
      shift: { select: { startAtUtc: true, endAtUtc: true } },
    },
  });

  type Bucket = {
    employeeId: string;
    fullName: string;
    isActive: boolean;
    hours: number;
    weekendShifts: number;
    nightShifts: number;
    closingShifts: number;
    closingDates: string[]; // for streak calc
  };
  const map = new Map<string, Bucket>();

  for (const a of assignments) {
    const start = DateTime.fromJSDate(a.shift.startAtUtc).setZone(tz);
    const end = DateTime.fromJSDate(a.shift.endAtUtc).setZone(tz);
    const hours = end.diff(start, 'hours').hours;
    const e = map.get(a.employee.id) ?? {
      employeeId: a.employee.id,
      fullName: a.employee.fullName,
      isActive: a.employee.isActive,
      hours: 0,
      weekendShifts: 0,
      nightShifts: 0,
      closingShifts: 0,
      closingDates: [],
    };
    e.hours += hours;
    if (isWeekend(start)) e.weekendShifts += 1;
    if (isNightShift(start, end)) e.nightShifts += 1;
    if (isClosingShift(end)) {
      e.closingShifts += 1;
      e.closingDates.push(start.toFormat('yyyy-MM-dd'));
    }
    map.set(a.employee.id, e);
  }

  const employees = [...map.values()].filter((e) => e.isActive);

  // Compute longest closing streak per employee
  const enriched = employees.map((e) => {
    const dates = e.closingDates.sort();
    let longest = 0;
    let cur = 0;
    let prev: DateTime | null = null;
    for (const ds of dates) {
      const d = DateTime.fromISO(ds);
      if (prev && d.diff(prev, 'days').days <= 2) {
        cur += 1;
      } else {
        cur = 1;
      }
      longest = Math.max(longest, cur);
      prev = d;
    }
    return { ...e, longestClosingStreak: longest };
  });

  // Compute team medians
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  };
  const team = {
    medianHours: median(enriched.map((e) => e.hours)),
    medianWeekend: median(enriched.map((e) => e.weekendShifts)),
    medianNight: median(enriched.map((e) => e.nightShifts)),
    medianClosing: median(enriched.map((e) => e.closingShifts)),
  };

  // Compute deviation-based fairness score: 100 = perfectly balanced
  const scored = enriched.map((e) => {
    const devH = team.medianHours > 0 ? (e.hours - team.medianHours) / team.medianHours : 0;
    const devW = team.medianWeekend > 0 ? (e.weekendShifts - team.medianWeekend) / team.medianWeekend : 0;
    const devN = team.medianNight > 0 ? (e.nightShifts - team.medianNight) / team.medianNight : 0;
    const devC = team.medianClosing > 0 ? (e.closingShifts - team.medianClosing) / team.medianClosing : 0;
    // RMS deviation across axes
    const rms = Math.sqrt((devH ** 2 + devW ** 2 + devN ** 2 + devC ** 2) / 4);
    const score = Math.max(0, Math.min(100, Math.round(100 - rms * 100)));
    // Red flags
    const flags: string[] = [];
    if (e.longestClosingStreak >= 3) flags.push(`${e.longestClosingStreak} סגירות ברצף`);
    if (devH > 0.3) flags.push('עומס שעות גבוה מהממוצע');
    if (devH < -0.3) flags.push('פחות שעות מהממוצע');
    if (devW > 0.5) flags.push('הרבה סופ"שים');
    if (devN > 0.5) flags.push('הרבה משמרות לילה');
    return {
      ...e,
      score,
      deviation: { hours: devH, weekend: devW, night: devN, closing: devC },
      flags,
    };
  });

  // Sort: red-flagged employees first, then lowest score
  scored.sort((a, b) => {
    if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length;
    return a.score - b.score;
  });

  return {
    windowDays: weeks * 7,
    windowStart: windowStart.toISO(),
    team: {
      ...team,
      medianHours: Math.round(team.medianHours * 10) / 10,
      employeeCount: enriched.length,
    },
    employees: scored.map((e) => ({
      employeeId: e.employeeId,
      fullName: e.fullName,
      score: e.score,
      hours: Math.round(e.hours * 10) / 10,
      weekendShifts: e.weekendShifts,
      nightShifts: e.nightShifts,
      closingShifts: e.closingShifts,
      longestClosingStreak: e.longestClosingStreak,
      flags: e.flags,
    })),
  };
}
