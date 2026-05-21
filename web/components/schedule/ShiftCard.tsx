"use client";

import { DateTime } from "luxon";
import { useDroppable } from "@dnd-kit/core";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeChip } from "./EmployeeChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Employee, Shift } from "@/lib/types";

export type ShiftValidationTone = "neutral" | "ok" | "warning" | "error";

interface Props {
  shift: Shift;
  employees: Record<string, Employee>;
  validationTone?: ShiftValidationTone;
  onUnassign: (employeeId: string) => void;
  onSwap?: (employeeId: string) => void;
}

const TIME_FORMAT = "HH:mm";

export function ShiftCard({
  shift,
  employees,
  validationTone = "neutral",
  onUnassign,
  onSwap,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `shift:${shift.id}`,
    data: { type: "shift", shiftId: shift.id },
  });

  const start = DateTime.fromISO(shift.startsAt).toFormat(TIME_FORMAT);
  const end = DateTime.fromISO(shift.endsAt).toFormat(TIME_FORMAT);

  const assigned = shift.assignments.filter((a) => a.status === "assigned");
  const understaffed = assigned.length < shift.requiredCount;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group rounded-lg border bg-card p-2 transition-all min-h-24",
        "shadow-xs",
        isOver && validationTone === "neutral" && "ring-2 ring-primary/40 bg-accent",
        validationTone === "ok" && "ring-2 ring-success/60 bg-success/5",
        validationTone === "warning" && "ring-2 ring-warning/60 bg-warning/5",
        validationTone === "error" && "ring-2 ring-destructive/60 bg-destructive/5",
      )}
      aria-label={`משמרת ${shift.role}, ${start} עד ${end}, ${assigned.length} מתוך ${shift.requiredCount} עובדים`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold">{shift.role}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {start}–{end}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] font-medium rounded-full px-1.5 py-0.5",
            understaffed
              ? "bg-destructive/15 text-destructive"
              : "bg-success/15 text-success",
          )}
        >
          {assigned.length}/{shift.requiredCount}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {assigned.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic inline-flex items-center gap-1">
            {understaffed && <AlertTriangle className="h-3 w-3" />}
            גרור עובד/ת לכאן
          </span>
        ) : (
          assigned.map((a) => {
            const emp = employees[a.employeeId];
            if (!emp) return null;
            return (
              <DropdownMenu key={a.id}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`פעולות על שיבוץ ${emp.fullName}`}
                    className="rounded-full"
                  >
                    <EmployeeChip
                      employee={emp}
                      onRemove={() => onUnassign(emp.id)}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => onUnassign(emp.id)} destructive>
                    בטל שיבוץ
                  </DropdownMenuItem>
                  {onSwap ? (
                    <DropdownMenuItem onClick={() => onSwap(emp.id)}>
                      החלפה…
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })
        )}
      </div>
    </div>
  );
}
