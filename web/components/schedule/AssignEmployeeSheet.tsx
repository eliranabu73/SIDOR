"use client";

import * as React from "react";
import { Search, UserPlus, AlertCircle, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Employee, EmployeeScheduleMetrics, Shift } from "@/lib/types";
import { DateTime } from "luxon";

interface Props {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  metricsByEmployee: Record<string, EmployeeScheduleMetrics | undefined>;
  onAssign: (employee: Employee) => void;
  locationFilter?: string | "all";
  /**
   * When the org has zero employees, shown as a "הוסף את הראשון" CTA in the
   * empty state. Wired by the schedule page to open QuickAddEmployeesDialog.
   */
  onAddFirstEmployee?: () => void;
}

/**
 * Shift-first assignment. Replaces the "select employee, then tap shift" flow.
 *
 * Triggered when the user taps a shift card (or the "+ הוסף עובד" affordance).
 * Shows a filtered list of employees with one-tap assign.
 */
export function AssignEmployeeSheet({
  shift,
  open,
  onOpenChange,
  employees,
  metricsByEmployee,
  onAssign,
  locationFilter = "all",
  onAddFirstEmployee,
}: Props) {
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (open) setSearch("");
  }, [open, shift?.id]);

  const assignedIds = React.useMemo(
    () =>
      new Set(
        shift?.assignments.filter((a) => a.status === "assigned").map((a) => a.employeeId) ?? [],
      ),
    [shift],
  );

  const candidates = React.useMemo(() => {
    if (!shift) return [];
    const q = search.trim().toLowerCase();
    const role = shift.role;
    return employees
      .filter((e) => e.active)
      .filter((e) => !assignedIds.has(e.id))
      .filter((e) =>
        locationFilter === "all" ? true : e.primaryLocationId === locationFilter,
      )
      .map((e) => {
        const roleMatch = e.roles.includes(role);
        const nameHit = q === "" || e.fullName.toLowerCase().includes(q);
        return { emp: e, roleMatch, nameHit };
      })
      .filter((r) => r.nameHit)
      .sort((a, b) => {
        if (a.roleMatch !== b.roleMatch) return a.roleMatch ? -1 : 1;
        return a.emp.fullName.localeCompare(b.emp.fullName, "he");
      });
  }, [employees, assignedIds, locationFilter, search, shift]);

  const startLabel = shift
    ? DateTime.fromISO(shift.startsAt).setLocale("he").toFormat("EEEE d.M · HH:mm")
    : "";
  const endLabel = shift ? DateTime.fromISO(shift.endsAt).toFormat("HH:mm") : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-sm sm:max-w-md flex flex-col gap-3 p-4 sm:p-5"
      >
        <SheetHeader className="mb-1">
          <SheetTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            שיבוץ למשמרת
          </SheetTitle>
          {shift ? (
            <SheetDescription className="text-foreground/80">
              <span className="font-medium">{shift.role}</span>
              <span dir="ltr" className="ms-2 tabular-nums opacity-80">
                {startLabel}–{endLabel}
              </span>
              <span className="ms-2 text-xs opacity-60">
                ({shift.assignments.filter((a) => a.status === "assigned").length}/
                {shift.requiredCount})
              </span>
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש עובד/ת…"
            className="pe-8 h-11"
            aria-label="חיפוש עובד/ת"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-5">
          {candidates.length === 0 ? (
            employees.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <div
                  aria-hidden
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Users className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  אין עובדים — הוסף את הראשון
                </p>
                <p className="text-xs text-muted-foreground">
                  כדי לשבץ עובדים, צריך קודם להוסיף לפחות עובד אחד.
                </p>
                {onAddFirstEmployee ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="glow"
                    onClick={() => {
                      onOpenChange(false);
                      onAddFirstEmployee();
                    }}
                    className="mt-1 w-full"
                  >
                    <UserPlus className="h-4 w-4" />
                    הוסף עובד ראשון
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <AlertCircle className="h-8 w-8 opacity-40" />
                <p className="text-sm">לא נמצאו עובדים מתאימים</p>
              </div>
            )
          ) : (
            <ul className="px-2 sm:px-3 divide-y">
              {candidates.map(({ emp, roleMatch }) => {
                const metric = metricsByEmployee[emp.id];
                const hrs = metric ? Math.round(metric.weeklyAssignedMinutes / 60) : 0;
                const target = metric ? Math.round(metric.weeklyTargetMinutes / 60) : 0;
                return (
                  <li key={emp.id}>
                    <button
                      type="button"
                      onClick={() => onAssign(emp)}
                      className={cn(
                        "w-full text-start py-3 px-3 sm:px-4 flex items-center gap-3 rounded-md hover:bg-accent active:bg-accent/80 transition-colors touch-target",
                      )}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-semibold shrink-0">
                        {initials(emp.fullName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          <span className="truncate">{emp.fullName}</span>
                          {!roleMatch && (
                            <span className="text-[10px] rounded-full bg-warning/20 text-foreground px-1.5 py-0.5">
                              לא מומלץ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {emp.roles.join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 tabular-nums text-xs text-muted-foreground">
                        <span>
                          {hrs}/{target}ש'
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}
