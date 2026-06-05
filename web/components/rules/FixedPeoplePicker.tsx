"use client";

import * as React from "react";
import { Plus, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DayPart, FixedAssignment } from "@/lib/rules-mapping";

type EmployeeOption = { id: string; fullName: string };

type Props = {
  employees: EmployeeOption[];
  dayParts: DayPart[];
  /** Active days (0=Sun..6=Sat) selectable for a fixed assignment. */
  activeDays: number[];
  fixed: FixedAssignment[];
  onChange: (next: FixedAssignment[]) => void;
};

const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const selectClass =
  "h-11 sm:h-10 w-full rounded-md border border-input bg-background px-2 text-base sm:text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/30";

/**
 * Maps specific employees to a day-part on chosen days ("Avi — mornings, all
 * week"). Produces FixedAssignment rows. Controlled: no server state.
 */
export function FixedPeoplePicker({
  employees,
  dayParts,
  activeDays,
  fixed,
  onChange,
}: Props) {
  const days = [...new Set(activeDays)].sort((a, b) => a - b);

  const update = (i: number, patch: Partial<FixedAssignment>) =>
    onChange(fixed.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const remove = (i: number) => onChange(fixed.filter((_, idx) => idx !== i));

  const add = () =>
    onChange([
      ...fixed,
      {
        employeeId: employees[0]?.id ?? "",
        dayPartId: dayParts[0]?.id ?? "",
        days: [...days],
      },
    ]);

  const toggleDay = (i: number, day: number) => {
    const row = fixed[i];
    if (!row) return;
    const has = row.days.includes(day);
    update(i, {
      days: has ? row.days.filter((d) => d !== day) : [...row.days, day].sort((a, b) => a - b),
    });
  };

  if (employees.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        הוסף עובדים בשלב הקודם כדי לקבע אנשים למשמרות.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {fixed.map((row, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[9rem] flex-1 space-y-1">
              <Label className="text-xs">עובד</Label>
              <select
                className={selectClass}
                value={row.employeeId}
                onChange={(e) => update(i, { employeeId: e.target.value })}
                aria-label="בחר עובד"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[8rem] flex-1 space-y-1">
              <Label className="text-xs">קבוע ב</Label>
              <select
                className={selectClass}
                value={row.dayPartId}
                onChange={(e) => update(i, { dayPartId: e.target.value })}
                aria-label="בחר חלק יום"
              >
                {dayParts.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.name} ({dp.start}–{dp.end})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
              aria-label="מחק שורה"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Day chips */}
          <div className="mt-3 space-y-1">
            <Label className="text-xs">בימים</Label>
            <div className="flex flex-wrap gap-1.5">
              {days.map((day) => {
                const on = row.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(i, day)}
                    aria-pressed={on}
                    className={
                      "min-w-[2.5rem] rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
                      (on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70")
                    }
                  >
                    {DAY_NAMES[day]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={add}
        disabled={dayParts.length === 0}
      >
        <Plus className="h-4 w-4" />
        <UserCheck className="h-4 w-4" />
        הוסף אדם קבוע
      </Button>
    </div>
  );
}
