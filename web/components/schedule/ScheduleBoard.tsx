"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftCard, type ShiftValidationTone } from "./ShiftCard";
import type { Employee, Schedule, Shift } from "@/lib/types";

const DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/** Total minutes across all shifts in a day — used for the per-column summary. */
function totalMinutes(shifts: Shift[]): number {
  return shifts.reduce((sum, s) => {
    const start = DateTime.fromISO(s.startsAt);
    const end = DateTime.fromISO(s.endsAt);
    const diff = end.diff(start, "minutes").minutes;
    return sum + Math.max(0, diff) * (s.requiredCount ?? 1);
  }, 0);
}

function formatHours(min: number): string {
  if (min <= 0) return "0";
  const h = Math.round(min / 60);
  return h.toString();
}

interface Props {
  schedule: Schedule;
  employees: Employee[];
  weekStart: DateTime;
  /**
   * Optional filter — only render shifts at these locations.
   */
  locationFilter?: string | "all";
  roleFilter?: string | "all";
  /**
   * Current viewer's user id. Used to compare against `shift.lockedByUserId`
   * — locks held by *me* should not appear as locked in my UI.
   */
  currentUserId?: string;
  // Lifted from DnD:
  validationByShift: Record<string, ShiftValidationTone>;
  activeEmployee: Employee | null;
  onUnassign: (shift: Shift, employeeId: string) => void;
  // Tap-to-assign (mobile):
  selectedEmployeeId?: string | null;
  onTapAssign?: (shift: Shift) => void;
}

export function ScheduleBoard({
  schedule,
  employees,
  weekStart,
  locationFilter = "all",
  roleFilter = "all",
  currentUserId,
  validationByShift,
  activeEmployee,
  onUnassign,
  selectedEmployeeId,
  onTapAssign,
}: Props) {
  const employeesById = React.useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const filteredShifts = React.useMemo(() => {
    return schedule.shifts.filter((s) => {
      if (locationFilter !== "all" && s.locationId !== locationFilter) return false;
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      return true;
    });
  }, [schedule.shifts, locationFilter, roleFilter]);

  const shiftsByDay = React.useMemo(() => {
    const groups: Shift[][] = Array.from({ length: 7 }, () => []);
    for (const s of filteredShifts) {
      const dt = DateTime.fromISO(s.startsAt);
      const day = dt.weekday % 7; // Sunday=0
      groups[day]!.push(s);
    }
    for (const list of groups) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return groups;
  }, [filteredShifts]);

  const [activeMobileDay, setActiveMobileDay] = React.useState<number>(() => {
    const todayIdx = DateTime.now().weekday % 7;
    return todayIdx;
  });

  return (
    <>
      {employees.length === 0 ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-card/40 px-4 py-3 text-sm"
          role="status"
        >
          <span className="text-muted-foreground">
            עדיין אין עובדים. הוסיפו עובדים כדי להתחיל לשבץ משמרות.
          </span>
          <a
            href="/employees"
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
          >
            הוספת עובדים
          </a>
        </div>
      ) : null}

      {/* Mobile — day selector + single-day list */}
      <div className="sm:hidden flex flex-col">
        <div className="flex border-b bg-background">
          {Array.from({ length: 7 }, (_, day) => {
            const date = weekStart.plus({ days: day });
            const isToday = date.hasSame(DateTime.now(), "day");
            const count = shiftsByDay[day]?.length ?? 0;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveMobileDay(day)}
                className={cn(
                  "flex-1 flex flex-col items-center py-2 text-[11px] font-medium transition-colors relative",
                  activeMobileDay === day
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground",
                  isToday && activeMobileDay !== day && "bg-primary/5",
                )}
              >
                <span className="font-semibold">{DAYS_HE[day]}</span>
                <span className="tabular-nums opacity-70">{date.toFormat("d.M")}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "mt-0.5 h-4 min-w-[16px] px-1 rounded-full text-[9px] flex items-center justify-center",
                      activeMobileDay === day
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 space-y-3">
          {(shiftsByDay[activeMobileDay] ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <CalendarDays className="h-10 w-10 opacity-30" />
              <p className="text-sm">אין משמרות ביום זה</p>
            </div>
          ) : (
            (shiftsByDay[activeMobileDay] ?? []).map((shift) => {
              const lockedByOther =
                !!shift.lockedByUserId && shift.lockedByUserId !== currentUserId;
              return (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  employees={employeesById}
                  validationTone={validationByShift[shift.id] ?? "neutral"}
                  isLocked={lockedByOther}
                  lockedByName={lockedByOther ? shift.lockedByName ?? undefined : undefined}
                  ghostEmployee={activeEmployee}
                  onUnassign={(empId) => onUnassign(shift, empId)}
                  onTapAssign={selectedEmployeeId ? () => onTapAssign?.(shift) : undefined}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Desktop — 7-column grid */}
      <div className="hidden sm:block sm:overflow-x-auto">
        <div
          className="flex flex-col gap-3 sm:grid sm:grid-cols-7 sm:gap-2 sm:min-w-[640px] md:min-w-[1100px]"
          role="grid"
        >
          {Array.from({ length: 7 }, (_, day) => {
            const date = weekStart.plus({ days: day });
            const isFirstCol = day === 0;
            const isToday = date.hasSame(DateTime.now(), "day");
            // Friday afternoon onwards + all of Saturday — Shabbat tint.
            const isShabbat = day === 6 || day === 5; // 5=ו (Friday), 6=ש (Saturday)
            const dayShifts = shiftsByDay[day] ?? [];
            const dayCount = dayShifts.length;
            const dayHours = formatHours(totalMinutes(dayShifts));
            return (
              <div
                key={day}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-card/40 p-2 sm:rounded-lg sm:border sm:p-2 sm:transition-colors",
                  isFirstCol && "sm:sticky sm:right-0 sm:z-10",
                  isToday
                    ? "sm:border-primary/40 sm:bg-primary/[0.04] sm:shadow-[0_0_0_1px_var(--color-primary-30)]"
                    : isShabbat
                      ? "sm:bg-amber-500/[0.04] sm:border-amber-500/20"
                      : "sm:bg-card/40",
                )}
                role="row"
                aria-current={isToday ? "date" : undefined}
              >
                <div
                  role="rowheader"
                  className={cn(
                    "flex flex-col items-center text-sm sm:text-xs font-semibold sm:sticky sm:top-0 sm:z-20 sm:bg-background/80 sm:backdrop-blur sm:rounded-md pb-1 sm:px-2 sm:py-1.5 sm:border",
                    isToday && "sm:border-primary/40 sm:bg-primary/10",
                    isShabbat && !isToday && "sm:border-amber-500/30",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-sm">{DAYS_HE[day]}</span>
                    <span className="text-muted-foreground tabular-nums text-xs">
                      {date.toFormat("d.M")}
                    </span>
                    {isToday ? (
                      <span className="hidden sm:inline-flex items-center rounded-full bg-primary px-1.5 py-0 text-[9px] font-bold text-primary-foreground">
                        היום
                      </span>
                    ) : null}
                  </div>
                  {dayCount > 0 ? (
                    <div className="mt-0.5 hidden sm:flex items-center gap-2 text-[10px] font-normal text-muted-foreground tabular-nums">
                      <span>{dayCount} משמרות</span>
                      <span aria-hidden>·</span>
                      <span>{dayHours} שעות</span>
                    </div>
                  ) : null}
                </div>
                <div role="gridcell" className="flex flex-col gap-2 min-h-32">
                  {(shiftsByDay[day] ?? []).map((shift) => {
                    const lockedByOther =
                      !!shift.lockedByUserId &&
                      shift.lockedByUserId !== currentUserId;
                    return (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        employees={employeesById}
                        validationTone={validationByShift[shift.id] ?? "neutral"}
                        isLocked={lockedByOther}
                        lockedByName={lockedByOther ? shift.lockedByName ?? undefined : undefined}
                        ghostEmployee={activeEmployee}
                        onUnassign={(empId) => onUnassign(shift, empId)}
                        onTapAssign={selectedEmployeeId ? () => onTapAssign?.(shift) : undefined}
                      />
                    );
                  })}
                  {(shiftsByDay[day] ?? []).length === 0 ? (
                    <div className={cn("rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground")}>
                      אין משמרות
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
