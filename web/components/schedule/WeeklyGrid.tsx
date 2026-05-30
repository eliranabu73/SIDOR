"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee, Schedule, Shift } from "@/lib/types";

const DAYS_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const DAYS_LONG  = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Any status that means "this employee is working this shift" */
function isActiveAssignment(status: string): boolean {
  return status === "assigned" || status === "confirmed" || status === "tentative";
}

/** Build lookup: employeeId → dayIdx(0=Sun) → shifts[] */
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
    const activeIds = s.assignments
      .filter((a) => isActiveAssignment(a.status))
      .map((a) => a.employeeId);

    if (activeIds.length === 0) {
      if (!unassignedByDay[dayIdx]) unassignedByDay[dayIdx] = [];
      unassignedByDay[dayIdx]!.push(s);
    } else {
      for (const empId of activeIds) {
        if (!byEmployee[empId]) byEmployee[empId] = {};
        if (!byEmployee[empId]![dayIdx]) byEmployee[empId]![dayIdx] = [];
        byEmployee[empId]![dayIdx]!.push(s);
      }
    }
  }
  return { byEmployee, unassignedByDay };
}

function fmtLocal(isoUtc: string): string {
  return DateTime.fromISO(isoUtc).toLocal().toFormat("HH:mm");
}

// ─── Shift pill ──────────────────────────────────────────────────────────────

function ShiftPill({
  shift,
  onRemove,
  compact = false,
}: {
  shift: Shift;
  onRemove?: (shift: Shift) => void;
  compact?: boolean;
}) {
  const label = `${fmtLocal(shift.startsAt)}–${fmtLocal(shift.endsAt)}`;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60",
        "text-indigo-800 dark:text-indigo-200 font-medium leading-tight whitespace-nowrap",
        compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-1 text-xs",
      )}
    >
      {/* Force LTR so HH:MM–HH:MM never flips in RTL context */}
      <span dir="ltr">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(shift); }}
          aria-label="הסר משמרת"
          className="hidden group-hover:flex items-center text-indigo-400 hover:text-red-500 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── Add button ──────────────────────────────────────────────────────────────

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex items-center justify-center h-7 w-7 rounded-full border border-dashed border-border/60
                 text-muted-foreground hover:border-indigo-400 hover:text-indigo-500
                 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface WeeklyGridProps {
  schedule: Schedule;
  employees: Employee[];
  weekStart: DateTime;
  locationFilter?: string | "all";
  roleFilter?: string | "all";
  onQuickAdd: (employeeId: string, date: DateTime) => void;
  onUnassign: (shift: Shift, employeeId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
}

// ─── Mobile: single-day employee list ────────────────────────────────────────

function MobileDayView({
  dayIdx,
  dayDate,
  activeEmployees,
  byEmployee,
  unassigned,
  onQuickAdd,
  onUnassign,
  onRequestAssign,
}: {
  dayIdx: number;
  dayDate: DateTime;
  activeEmployees: Employee[];
  byEmployee: Record<string, Record<number, Shift[]>>;
  unassigned: Shift[];
  onQuickAdd: (empId: string, date: DateTime) => void;
  onUnassign: (shift: Shift, empId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
}) {
  return (
    <div className="flex flex-col divide-y">
      {activeEmployees.map((emp) => {
        const dayShifts = byEmployee[emp.id]?.[dayIdx] ?? [];
        return (
          <div key={emp.id} className="flex items-center gap-2 px-3 py-2 min-h-[3rem]">
            {/* Name */}
            <span className="w-28 shrink-0 text-sm font-medium truncate">{emp.fullName}</span>

            {/* Shifts + add button */}
            <div className="flex flex-wrap gap-1 flex-1 items-center">
              {dayShifts.map((s) => (
                <ShiftPill key={s.id} shift={s} onRemove={(sh) => onUnassign(sh, emp.id)} />
              ))}
              <AddBtn
                onClick={() => onQuickAdd(emp.id, dayDate)}
                label={`הוסף משמרת ל${emp.fullName}`}
              />
            </div>
          </div>
        );
      })}

      {/* Unassigned shifts for this day */}
      {unassigned.length > 0 && (
        <div className="px-3 py-2 bg-amber-50/60 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
            ללא שיבוץ ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {unassigned.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onRequestAssign?.(s)}
                className="flex items-center rounded-md bg-amber-100 dark:bg-amber-900/50
                           px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-200
                           hover:bg-amber-200 transition-colors"
              >
                <span dir="ltr">{fmtLocal(s.startsAt)}–{fmtLocal(s.endsAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Desktop: full 7-column grid ─────────────────────────────────────────────

function DesktopGrid({
  weekStart,
  activeEmployees,
  byEmployee,
  unassignedByDay,
  onQuickAdd,
  onUnassign,
  onRequestAssign,
}: {
  weekStart: DateTime;
  activeEmployees: Employee[];
  byEmployee: Record<string, Record<number, Shift[]>>;
  unassignedByDay: Record<number, Shift[]>;
  onQuickAdd: (empId: string, date: DateTime) => void;
  onUnassign: (shift: Shift, empId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
}) {
  const dayDates = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  const todayIdx = DateTime.now().weekday % 7;

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm" dir="rtl" aria-label="סידור שבועי">
        <colgroup>
          <col className="w-36" />
          {Array.from({ length: 7 }).map((_, i) => <col key={i} />)}
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky end-0 z-10 bg-muted/40 py-2 px-3 text-start text-xs font-semibold text-muted-foreground">
              עובד/ת
            </th>
            {dayDates.map((dt, i) => {
              const isToday = i === todayIdx;
              return (
                <th key={i} className={cn(
                  "py-2 px-1 text-center text-xs font-semibold",
                  isToday ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground",
                )}>
                  <div>{DAYS_SHORT[i]}</div>
                  <div className={cn(
                    "mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    isToday ? "bg-indigo-500 text-white font-bold" : "",
                  )}>
                    {dt.day}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {activeEmployees.map((emp) => (
            <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
              <td className="sticky end-0 bg-background py-1.5 px-3 text-xs font-medium truncate max-w-[9rem]">
                <span title={emp.fullName}>{emp.fullName}</span>
              </td>
              {dayDates.map((dt, dayIdx) => {
                const dayShifts = byEmployee[emp.id]?.[dayIdx] ?? [];
                return (
                  <td key={dayIdx} className="group/cell py-1 px-1 align-top min-w-[5rem]">
                    <div className="flex flex-col gap-0.5 min-h-[2rem]">
                      {dayShifts.map((s) => (
                        <ShiftPill key={s.id} shift={s} compact onRemove={(sh) => onUnassign(sh, emp.id)} />
                      ))}
                      <div className={cn("opacity-0 group-hover/cell:opacity-100 transition-opacity", dayShifts.length > 0 && "mt-0.5")}>
                        <AddBtn onClick={() => onQuickAdd(emp.id, dt)} label={`הוסף משמרת ל${emp.fullName}`} />
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Unassigned row */}
          {Object.keys(unassignedByDay).length > 0 && (
            <tr className="border-t border-dashed bg-amber-50/40 dark:bg-amber-950/10">
              <td className="sticky end-0 bg-amber-50/60 dark:bg-amber-950/20 py-1.5 px-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                ללא שיבוץ
              </td>
              {dayDates.map((_, dayIdx) => {
                const shifts = unassignedByDay[dayIdx] ?? [];
                return (
                  <td key={dayIdx} className="py-1 px-1 align-top">
                    <div className="flex flex-col gap-0.5">
                      {shifts.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onRequestAssign?.(s)}
                          className="flex items-center rounded-md bg-amber-100 dark:bg-amber-900/50
                                     px-1.5 py-0.5 text-[10px] font-medium text-amber-800
                                     dark:text-amber-200 hover:bg-amber-200 transition-colors"
                          title="לחץ לשיבוץ"
                        >
                          <span dir="ltr">{fmtLocal(s.startsAt)}–{fmtLocal(s.endsAt)}</span>
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

// ─── Main component ───────────────────────────────────────────────────────────

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

  const dayDates = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart],
  );

  const todayIdx = DateTime.now().weekday % 7;
  const [selectedDay, setSelectedDay] = React.useState<number>(() => todayIdx);

  const activeEmployees = employees.filter((e) => e.active);

  return (
    <>
      {/* ── MOBILE (< md) ── day tabs + single-day list */}
      <div className="md:hidden flex flex-col">
        {/* Day tab strip */}
        <div className="flex items-center border-b bg-background sticky top-0 z-10">
          <button
            type="button"
            aria-label="יום קודם"
            onClick={() => setSelectedDay((d) => Math.max(0, d - 1))}
            disabled={selectedDay === 0}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="flex flex-1 overflow-hidden">
            {dayDates.map((dt, i) => {
              const isActive = i === selectedDay;
              const isToday = i === todayIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDay(i)}
                  className={cn(
                    "flex flex-1 flex-col items-center py-1.5 text-xs transition-colors border-b-2",
                    isActive
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{DAYS_SHORT[i]}</span>
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                    isToday && isActive ? "bg-indigo-500 text-white font-bold" : "",
                    isToday && !isActive ? "font-bold text-indigo-500" : "",
                  )}>
                    {dt.day}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="יום הבא"
            onClick={() => setSelectedDay((d) => Math.min(6, d + 1))}
            disabled={selectedDay === 6}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Day label */}
        <div className="px-3 py-2 bg-muted/30 border-b text-sm font-semibold">
          יום {DAYS_LONG[selectedDay]}, {dayDates[selectedDay]?.toFormat("d/M")}
        </div>

        {/* Employee list for selected day */}
        <MobileDayView
          dayIdx={selectedDay}
          dayDate={dayDates[selectedDay]!}
          activeEmployees={activeEmployees}
          byEmployee={byEmployee}
          unassigned={unassignedByDay[selectedDay] ?? []}
          onQuickAdd={onQuickAdd}
          onUnassign={onUnassign}
          onRequestAssign={onRequestAssign}
        />
      </div>

      {/* ── DESKTOP (≥ md) ── full weekly grid */}
      <div className="hidden md:block">
        <DesktopGrid
          weekStart={weekStart}
          activeEmployees={activeEmployees}
          byEmployee={byEmployee}
          unassignedByDay={unassignedByDay}
          onQuickAdd={onQuickAdd}
          onUnassign={onUnassign}
          onRequestAssign={onRequestAssign}
        />
      </div>
    </>
  );
}
