"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee, Schedule, Shift } from "@/lib/types";

const DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/**
 * Build a nested map: employeeId → dayIndex (0=Sun) → shifts[].
 * Also collects unassigned shifts per day (no confirmed assignment).
 */
function buildShiftMap(
  shifts: Shift[],
  locationFilter: string | "all",
  roleFilter: string | "all",
): {
  byEmployee: Record<string, Record<number, Shift[]>>;
  unassignedByDay: Record<number, Shift[]>;
} {
  const byEmployee: Record<string, Record<number, Shift[]>> = {};
  const unassignedByDay: Record<number, Shift[]> = {};

  for (const s of shifts) {
    if (locationFilter !== "all" && s.locationId !== locationFilter) continue;
    if (roleFilter !== "all" && s.role !== roleFilter) continue;

    const dayIdx = DateTime.fromISO(s.startsAt).weekday % 7; // Sunday=0

    const assignedIds = s.assignments
      .filter((a) => a.status === "assigned")
      .map((a) => a.employeeId);

    if (assignedIds.length === 0) {
      // Unassigned shift — show in a special unassigned row
      if (!unassignedByDay[dayIdx]) unassignedByDay[dayIdx] = [];
      unassignedByDay[dayIdx]!.push(s);
    } else {
      for (const empId of assignedIds) {
        if (!byEmployee[empId]) byEmployee[empId] = {};
        if (!byEmployee[empId]![dayIdx]) byEmployee[empId]![dayIdx] = [];
        byEmployee[empId]![dayIdx]!.push(s);
      }
    }
  }
  return { byEmployee, unassignedByDay };
}

function formatLocalTime(isoUtc: string): string {
  return DateTime.fromISO(isoUtc).toLocal().toFormat("HH:mm");
}

interface ShiftPillProps {
  shift: Shift;
  onRemove?: (shift: Shift) => void;
}

function ShiftPill({ shift, onRemove }: ShiftPillProps) {
  const start = formatLocalTime(shift.startsAt);
  const end = formatLocalTime(shift.endsAt);

  return (
    <div className="group relative flex items-center gap-1 rounded-md bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800 dark:text-indigo-200 leading-tight">
      <span className="tabular-nums whitespace-nowrap">
        {start}–{end}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(shift);
          }}
          aria-label="הסר משמרת"
          className="hidden group-hover:flex items-center justify-center rounded-full text-indigo-500 hover:text-red-600 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface AddCellButtonProps {
  onClick: () => void;
  label: string;
}
function AddCellButton({ onClick, label }: AddCellButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-full w-full min-h-[2.25rem] items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground opacity-0 group-hover/cell:opacity-100 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

export interface WeeklyGridProps {
  schedule: Schedule;
  employees: Employee[];
  weekStart: DateTime;
  locationFilter?: string | "all";
  roleFilter?: string | "all";
  /** Called when user taps an empty cell — open quick-add sheet for this employee+day */
  onQuickAdd: (employeeId: string, date: DateTime) => void;
  /** Called when user removes an assignment from a shift */
  onUnassign: (shift: Shift, employeeId: string) => void;
  /** Called when user requests to assign an employee to an unassigned shift */
  onRequestAssign?: (shift: Shift) => void;
}

export function WeeklyGrid({
  schedule,
  employees,
  weekStart,
  locationFilter = "all",
  roleFilter = "all",
  onQuickAdd,
  onUnassign,
  onRequestAssign,
}: WeeklyGridProps) {
  const { byEmployee, unassignedByDay } = React.useMemo(
    () => buildShiftMap(schedule.shifts, locationFilter, roleFilter),
    [schedule.shifts, locationFilter, roleFilter],
  );

  // Which days of the week have any data (for mobile compactness)
  const dayDates = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart],
  );

  const todayIdx = DateTime.now().weekday % 7;

  const activeEmployees = employees.filter((e) => e.active);

  const hasUnassigned = Object.keys(unassignedByDay).length > 0;

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full table-fixed border-collapse text-sm"
        dir="rtl"
        aria-label="סידור שבועי"
      >
        <colgroup>
          {/* Employee name column */}
          <col className="w-28 sm:w-36" />
          {/* 7 day columns */}
          {Array.from({ length: 7 }).map((_, i) => (
            <col key={i} />
          ))}
        </colgroup>

        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky end-0 z-10 bg-muted/40 py-2 px-2 text-start text-xs font-semibold text-muted-foreground">
              עובד/ת
            </th>
            {dayDates.map((dt, i) => {
              const isToday = i === todayIdx;
              return (
                <th
                  key={i}
                  className={cn(
                    "py-2 px-1 text-center text-xs font-semibold",
                    isToday
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-muted-foreground",
                  )}
                >
                  <div>{DAYS_HE[i]}</div>
                  <div
                    className={cn(
                      "mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                      isToday
                        ? "bg-indigo-500 text-white font-bold"
                        : "text-muted-foreground",
                    )}
                  >
                    {dt.day}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {/* Employee rows */}
          {activeEmployees.map((emp) => {
            const empMap = byEmployee[emp.id] ?? {};
            return (
              <tr
                key={emp.id}
                className="border-b last:border-0 hover:bg-muted/20 transition-colors"
              >
                {/* Sticky name cell */}
                <td className="sticky end-0 bg-background py-1.5 px-2 font-medium text-xs leading-tight max-w-[7rem] sm:max-w-[9rem]">
                  <span className="block truncate" title={emp.fullName}>
                    {emp.fullName}
                  </span>
                </td>

                {/* Day cells */}
                {dayDates.map((dt, dayIdx) => {
                  const dayShifts = empMap[dayIdx] ?? [];
                  return (
                    <td
                      key={dayIdx}
                      className="group/cell relative py-1 px-1 align-top min-w-[4.5rem]"
                    >
                      <div className="flex flex-col gap-0.5 min-h-[2.25rem]">
                        {dayShifts.map((shift) => (
                          <ShiftPill
                            key={shift.id}
                            shift={shift}
                            onRemove={(s) => onUnassign(s, emp.id)}
                          />
                        ))}
                        {dayShifts.length === 0 && (
                          <AddCellButton
                            onClick={() => onQuickAdd(emp.id, dt)}
                            label={`הוסף משמרת ל${emp.fullName} ב${DAYS_HE[dayIdx]}`}
                          />
                        )}
                        {dayShifts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onQuickAdd(emp.id, dt)}
                            aria-label={`הוסף משמרת נוספת ל${emp.fullName}`}
                            className="flex h-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/cell:opacity-60 hover:opacity-100 hover:text-indigo-500 transition-all"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Unassigned shifts row */}
          {hasUnassigned && (
            <tr className="border-t border-dashed bg-amber-50/40 dark:bg-amber-950/10">
              <td className="sticky end-0 bg-amber-50/60 dark:bg-amber-950/20 py-1.5 px-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                ללא שיבוץ
              </td>
              {dayDates.map((_, dayIdx) => {
                const shifts = unassignedByDay[dayIdx] ?? [];
                return (
                  <td key={dayIdx} className="py-1 px-1 align-top">
                    <div className="flex flex-col gap-0.5">
                      {shifts.map((shift) => (
                        <button
                          key={shift.id}
                          type="button"
                          onClick={() => onRequestAssign?.(shift)}
                          className="flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-200 transition-colors text-start"
                          title="לחץ לשיבוץ עובד"
                        >
                          <span className="tabular-nums whitespace-nowrap">
                            {formatLocalTime(shift.startsAt)}–{formatLocalTime(shift.endsAt)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
