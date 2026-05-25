"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftCard, type ShiftValidationTone } from "./ShiftCard";
import type { Employee, Schedule, Shift } from "@/lib/types";

const DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

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
            return (
              <div
                key={day}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-card/40 p-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0",
                  isFirstCol && "sm:sticky sm:right-0 sm:z-10 sm:bg-card",
                )}
                role="row"
              >
                <div
                  role="rowheader"
                  className="flex items-center justify-between sm:justify-center sm:flex-col text-sm sm:text-xs font-semibold sm:sticky sm:top-0 sm:z-20 sm:bg-background pb-1 sm:border-b"
                >
                  <div className="text-base sm:text-xs">{DAYS_HE[day]}</div>
                  <div className="text-muted-foreground tabular-nums">
                    {date.toFormat("d.M")}
                  </div>
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
