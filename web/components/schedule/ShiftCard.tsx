"use client";

import { DateTime } from "luxon";
import { useDroppable } from "@dnd-kit/core";
import { Clock, AlertTriangle, Lock } from "lucide-react";
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
  isLocked?: boolean;
  lockedByName?: string;
  onUnassign: (employeeId: string) => void;
  onSwap?: (employeeId: string) => void;
}

const TIME_FORMAT = "HH:mm";

/**
 * ShiftCard — design system co-authored with ChatGPT.
 * Rule: card background almost never changes. Only border, accent strip,
 * and (during drag) overlay tint shift between states. Tokens are in
 * `app/globals.css` under @theme as `--color-shift-*`.
 */
export function ShiftCard({
  shift,
  employees,
  validationTone = "neutral",
  isLocked = false,
  lockedByName,
  onUnassign,
  onSwap,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `shift:${shift.id}`,
    data: { type: "shift", shiftId: shift.id },
    disabled: isLocked,
  });

  const start = DateTime.fromISO(shift.startsAt).toFormat(TIME_FORMAT);
  const end = DateTime.fromISO(shift.endsAt).toFormat(TIME_FORMAT);

  const assigned = shift.assignments.filter((a) => a.status === "assigned");
  const empty = assigned.length === 0;
  const understaffed = assigned.length < shift.requiredCount;
  const isOpen = empty && shift.isOpen;

  // Pick the base resting state — drag overlays take over inside isOver.
  const restingState: "empty" | "ok" | "warning" | "conflict" | "open" | "locked" =
    isLocked
      ? "locked"
      : isOpen
        ? "open"
        : empty
          ? "empty"
          : validationTone === "warning"
            ? "warning"
            : validationTone === "error"
              ? "conflict"
              : "ok";

  // Drag-over overlays use the FULL tint — this is the one place where bg fills.
  const dragOverlay: "valid" | "warning" | "blocked" | null =
    isOver && !isLocked
      ? validationTone === "error"
        ? "blocked"
        : validationTone === "warning"
          ? "warning"
          : "valid"
      : null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "shift-card group relative rounded-lg p-2 min-h-24 border",
        // empty / dashed
        restingState === "empty" && "border-dashed opacity-95",
        // locked is visually quieter
        restingState === "locked" && "opacity-90 cursor-not-allowed",
      )}
      style={shiftCardStyle(restingState, dragOverlay)}
      aria-label={`משמרת ${shift.role}, ${start} עד ${end}, ${assigned.length} מתוך ${shift.requiredCount} עובדים${isLocked ? " — נעולה לעריכה" : ""}`}
    >
      {/* Accent strip — pinned to inline-start (RTL = right side) */}
      {(restingState === "ok" ||
        restingState === "warning" ||
        restingState === "conflict" ||
        restingState === "open") && (
        <span
          aria-hidden
          className="absolute inset-y-1 start-0 w-[3px] rounded-full"
          style={{ background: stateAccent(restingState) }}
        />
      )}

      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold inline-flex items-center gap-1">
            {isLocked && <Lock className="h-3 w-3" />}
            {shift.role}
          </span>
          <span className="text-[11px] tabular-nums inline-flex items-center gap-1 opacity-80">
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

      {isLocked && lockedByName && (
        <p className="text-[10px] mb-1 opacity-70">נערך כעת ע"י {lockedByName}</p>
      )}

      <div className="flex flex-wrap gap-1">
        {empty ? (
          <span className="text-[11px] italic inline-flex items-center gap-1 opacity-80">
            {understaffed && !isOpen && <AlertTriangle className="h-3 w-3" />}
            {isOpen ? "משמרת פתוחה — לעובדים לקחת" : "גרור עובד/ת לכאן"}
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

function shiftCardStyle(
  state: "empty" | "ok" | "warning" | "conflict" | "open" | "locked",
  drag: "valid" | "warning" | "blocked" | null,
): React.CSSProperties {
  // During drag the full tint overlays the resting tokens.
  if (drag === "valid") {
    return {
      backgroundColor: "var(--color-drag-valid-bg)",
      borderColor: "var(--color-drag-valid-border)",
      color: "var(--color-shift-fg)",
    };
  }
  if (drag === "warning") {
    return {
      backgroundColor: "var(--color-drag-warning-bg)",
      borderColor: "var(--color-drag-warning-border)",
      color: "var(--color-shift-fg)",
    };
  }
  if (drag === "blocked") {
    return {
      backgroundColor: "var(--color-drag-blocked-bg)",
      borderColor: "var(--color-drag-blocked-border)",
      color: "var(--color-shift-fg)",
    };
  }
  // Resting states — base bg unchanged, only border + fg shift.
  switch (state) {
    case "empty":
      return {
        backgroundColor: "var(--color-shift-empty-bg)",
        borderColor: "var(--color-shift-empty-border)",
        color: "var(--color-shift-empty-fg)",
      };
    case "ok":
      return {
        backgroundColor: "var(--color-shift-ok-bg)",
        borderColor: "var(--color-shift-ok-border)",
        color: "var(--color-shift-ok-fg)",
      };
    case "warning":
      return {
        backgroundColor: "var(--color-shift-warning-bg)",
        borderColor: "var(--color-shift-warning-border)",
        color: "var(--color-shift-warning-fg)",
      };
    case "conflict":
      return {
        backgroundColor: "var(--color-shift-conflict-bg)",
        borderColor: "var(--color-shift-conflict-border)",
        color: "var(--color-shift-conflict-fg)",
      };
    case "open":
      return {
        backgroundColor: "var(--color-open-shift-bg)",
        borderColor: "var(--color-open-shift-border)",
        color: "var(--color-shift-fg)",
      };
    case "locked":
      return {
        backgroundColor: "var(--color-shift-locked-bg)",
        borderColor: "var(--color-shift-locked-border)",
        color: "var(--color-shift-locked-fg)",
      };
  }
}

function stateAccent(
  state: "ok" | "warning" | "conflict" | "open",
): string {
  switch (state) {
    case "ok":
      return "var(--color-shift-ok-accent)";
    case "warning":
      return "var(--color-shift-warning-accent)";
    case "conflict":
      return "var(--color-shift-conflict-accent)";
    case "open":
      return "var(--color-open-shift-accent)";
  }
}
