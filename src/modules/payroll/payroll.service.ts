import { prisma as defaultPrisma } from '../../db/prisma';
import type { Db } from '../../db/prisma';
import {
  HILAN_HEADERS,
  STANDARD_HEADERS,
  toHilanRow,
  toStandardRow,
  type PayrollRow,
} from './hilan-adapter.service';
import { computeActualMinutes } from '../timetracking/timetracking.service';

/**
 * Israeli minimum wage (gross) — used as fallback when an employee has no
 * hourlyRate set. Mirrors labor-cost.service for consistency.
 */
const DEFAULT_HOURLY_RATE_ILS = 35;
const REGULAR_MINUTES_PER_DAY = 8 * 60;
const TIER_125_CAP_MINUTES = 10 * 60;
const OT_125_MULTIPLIER = 1.25;
const OT_150_MULTIPLIER = 1.5;
const SHABBAT_MULTIPLIER = 1.5;

export type PayrollFormat = 'standard' | 'hilan';

export interface GeneratePayrollExportInput {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  format: PayrollFormat;
  /** Optional: when set, only include employees whose defaultLocationId matches. */
  locationId?: string;
}

export interface PayrollExportResult {
  format: PayrollFormat;
  headers: readonly string[];
  rows: Array<Record<string, string>>;
  rawRows: PayrollRow[];
  filename: string;
}

/** Pull weekday (0..6, Sun..Sat) and hour for a UTC instant in an IANA TZ. */
function localParts(
  instant: Date,
  timezone: string,
): { dayOfWeek: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dayOfWeek: map[wd] ?? 0,
    hour: parseInt(hr, 10) % 24,
  };
}

/**
 * Compute minutes of a [start..end] window that fall inside Shabbat in the
 * given timezone — "Friday from 18:00 → Saturday until end of day". Walks
 * the window in 15-minute slices; cheap (max ~96 slices/day).
 */
function shabbatMinutesInWindow(
  startUtc: Date,
  endUtc: Date,
  timezone: string,
): number {
  const SLICE_MIN = 15;
  let total = 0;
  for (
    let t = startUtc.getTime();
    t < endUtc.getTime();
    t += SLICE_MIN * 60_000
  ) {
    const sliceEnd = Math.min(t + SLICE_MIN * 60_000, endUtc.getTime());
    const sliceMin = (sliceEnd - t) / 60_000;
    const { dayOfWeek, hour } = localParts(new Date(t), timezone);
    const isFridayEve = dayOfWeek === 5 && hour >= 18;
    const isSaturday = dayOfWeek === 6;
    if (isFridayEve || isSaturday) total += sliceMin;
  }
  return total;
}

interface ShiftLite {
  startAtUtc: Date;
  endAtUtc: Date;
  timezone: string;
}

interface AggregateAccumulator {
  employeeId: string;
  fullName: string;
  israeliId: string | null;
  hourlyRate: number;
  regularMin: number;
  ot125Min: number;
  ot150Min: number;
  weekendMin: number;
  tipsAgorot: number;
  /** Total scheduled minutes (from shift assignments). */
  scheduledMinutes: number;
}

/**
 * Generate a payroll export for an org over [periodStart, periodEnd).
 *
 * Rules per shift:
 *  - First 8h → regular (100%)
 *  - 8h..10h → 125%
 *  - >10h → 150%
 *  - Shabbat hours (Fri 18:00 → end of Sat, employee TZ) are surfaced as
 *    a separate column. They're already counted in the tier buckets; the
 *    Shabbat figure is informational so payroll can layer the 1.5×
 *    premium on top per IL custom.
 *  - Gross ≈ regularHours × rate + ot125 × rate × 1.25 + ot150 × rate × 1.5
 */
export async function generatePayrollExport(
  input: GeneratePayrollExportInput,
  db: Db = defaultPrisma,
): Promise<PayrollExportResult> {
  const { orgId, periodStart, periodEnd, format, locationId } = input;

  const assignments = await db.shiftAssignment.findMany({
    where: {
      assignmentStatus: 'CONFIRMED',
      shift: {
        organizationId: orgId,
        startAtUtc: { gte: periodStart, lt: periodEnd },
      },
      // When locationId is provided, restrict to employees at that location.
      ...(locationId
        ? { employee: { defaultLocationId: locationId } }
        : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          email: true,
          hourlyRate: true,
          defaultTimezone: true,
          israeliId: true,
        },
      },
      shift: {
        select: {
          startAtUtc: true,
          endAtUtc: true,
          timezone: true,
        },
      },
    },
  });

  const byEmp = new Map<string, AggregateAccumulator>();

  for (const a of assignments) {
    const emp = a.employee;
    const shift: ShiftLite = a.shift;
    const shiftMin = Math.max(
      0,
      Math.round(
        (shift.endAtUtc.getTime() - shift.startAtUtc.getTime()) / 60_000,
      ),
    );
    if (shiftMin === 0) continue;

    const regular = Math.min(shiftMin, REGULAR_MINUTES_PER_DAY);
    const ot125 = Math.max(
      0,
      Math.min(shiftMin, TIER_125_CAP_MINUTES) - REGULAR_MINUTES_PER_DAY,
    );
    const ot150 = Math.max(0, shiftMin - TIER_125_CAP_MINUTES);

    const tz = shift.timezone || emp.defaultTimezone || 'Asia/Jerusalem';
    const weekend = shabbatMinutesInWindow(
      shift.startAtUtc,
      shift.endAtUtc,
      tz,
    );

    let acc = byEmp.get(emp.id);
    if (!acc) {
      acc = {
        employeeId: emp.id,
        fullName: emp.fullName,
        israeliId: emp.israeliId ?? null,
        hourlyRate:
          emp.hourlyRate != null
            ? Number(emp.hourlyRate)
            : DEFAULT_HOURLY_RATE_ILS,
        regularMin: 0,
        ot125Min: 0,
        ot150Min: 0,
        weekendMin: 0,
        tipsAgorot: 0,
        scheduledMinutes: 0,
      };
      byEmp.set(emp.id, acc);
    }
    acc.regularMin += regular;
    acc.ot125Min += ot125;
    acc.ot150Min += ot150;
    acc.weekendMin += weekend;
    acc.scheduledMinutes += shiftMin;
  }

  // Fetch tip distributions for all employees in the period (Israeli Tip Law 2022).
  // tipPool.shiftDate is stored at noon UTC; query the full period range.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tipDists = await (db as any).tipDistribution.findMany({
    where: {
      tipPool: {
        organizationId: orgId,
        shiftDate: { gte: periodStart, lte: periodEnd },
      },
    },
    select: {
      employeeId: true,
      amountAgorot: true,
    },
  });

  for (const dist of tipDists) {
    const acc = byEmp.get(dist.employeeId);
    if (acc) {
      acc.tipsAgorot += dist.amountAgorot;
    }
  }

  // Fetch actual worked minutes from time-tracking punches for every employee
  // who has scheduled shifts in this period.
  const employeeIds = Array.from(byEmp.keys());
  const actualMinutesMap = new Map<string, number>();

  if (employeeIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timeEntries = await (db as any).timeEntry.findMany({
      where: {
        organizationId: orgId,
        employeeId: { in: employeeIds },
        clockInAt: { gte: periodStart, lte: periodEnd },
        clockOutAt: { not: null },
      },
      select: {
        employeeId: true,
        clockInAt: true,
        clockOutAt: true,
      },
    }) as Array<{ employeeId: string; clockInAt: Date; clockOutAt: Date | null }>;

    for (const empId of employeeIds) {
      const empEntries = timeEntries.filter((e) => e.employeeId === empId);
      actualMinutesMap.set(empId, computeActualMinutes(empEntries));
    }
  }

  const rawRows: PayrollRow[] = Array.from(byEmp.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'))
    .map((acc) => {
      const actualMinutes = actualMinutesMap.get(acc.employeeId) ?? 0;

      // Use actual punched minutes when available; fall back to scheduled minutes.
      const billableMinutes = actualMinutes > 0 ? actualMinutes : acc.scheduledMinutes;

      // Re-compute overtime tiers from billable minutes so the CSV reflects
      // the actual (punched) hours rather than the scheduled plan.
      const regularMin = Math.min(billableMinutes, REGULAR_MINUTES_PER_DAY);
      const ot125Min = Math.max(0, Math.min(billableMinutes, TIER_125_CAP_MINUTES) - REGULAR_MINUTES_PER_DAY);
      const ot150Min = Math.max(0, billableMinutes - TIER_125_CAP_MINUTES);

      const regularH = regularMin / 60;
      const ot125H = ot125Min / 60;
      const ot150H = ot150Min / 60;
      const weekendH = acc.weekendMin / 60;
      const totalH = regularH + ot125H + ot150H;
      const gross =
        regularH * acc.hourlyRate +
        ot125H * acc.hourlyRate * OT_125_MULTIPLIER +
        ot150H * acc.hourlyRate * OT_150_MULTIPLIER +
        // Shabbat premium delta (already paid as regular, top up to 1.5×).
        weekendH * acc.hourlyRate * (SHABBAT_MULTIPLIER - 1);
      const [firstName, ...rest] = acc.fullName.trim().split(/\s+/);
      return {
        employeeId: acc.employeeId,
        fullName: acc.fullName,
        firstName: firstName ?? acc.fullName,
        lastName: rest.join(' '),
        idNumber: acc.israeliId ?? '',
        totalHours: round2(totalH),
        regularHours: round2(regularH),
        ot125Hours: round2(ot125H),
        ot150Hours: round2(ot150H),
        weekendHours: round2(weekendH),
        totalGrossILS: round2(gross),
        tipsAgorot: acc.tipsAgorot,
        actualMinutes,
        scheduledMinutes: acc.scheduledMinutes,
      };
    });

  const headers: readonly string[] =
    format === 'hilan' ? HILAN_HEADERS : STANDARD_HEADERS;
  const rows = rawRows.map((r) =>
    format === 'hilan' ? toHilanRow(r) : toStandardRow(r),
  );

  const isoStart = periodStart.toISOString().slice(0, 10);
  const isoEnd = new Date(periodEnd.getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const filename = `payroll-${format}-${isoStart}_${isoEnd}.csv`;

  return { format, headers, rows, rawRows, filename };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Serialise headers + rows to a CSV string prefixed with a UTF-8 BOM so
 * Excel on Windows/macOS opens Hebrew columns correctly. Manual escaping
 * — no papaparse dependency required. */
export function toCsv(
  headers: readonly string[],
  rows: Array<Record<string, string>>,
): string {
  const bom = '﻿';
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','));
  }
  return bom + lines.join('\r\n');
}

function csvEscape(value: string): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
