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
export type ShiftDensity = "compact" | "standard" | "dense";

interface Props {
  shift: Shift;
  employees: Record<string, Employee>;
  validationTone?: ShiftValidationTone;
  /**
   * Density — Compact = identify, Standard = manage, Dense = decide.
   * Card height, padding, and chip variant cascade off this prop.
   */
  density?: ShiftDensity;
  isLocked?: boolean;
  lockedByName?: string;
  /**
   * When the user is currently dragging an employee, the board passes that
   * employee here so a "ghost chip" preview can render in this card when
   * `isOver === true && validationTone === 'ok'` — Future-State Preview.
   */
  ghostEmployee?: Employee | null;
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
  density = "standard",
  isLocked = false,
  lockedByName,
  ghostEmployee = null,
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
      data-drag-over={isOver && !isLocked ? "true" : undefined}
      className={cn(
        "shift-card group relative rounded-lg border",
        // empty / dashed
        restingState === "empty" && "border-dashed opacity-95",
        // locked is visually quieter
        restingState === "locked" && "opacity-90 cursor-not-allowed",
      )}
      style={{ ...shiftCardStyle(restingState, dragOverlay), ...densitySizing(density) }}
      aria-label={`משמרת ${shift.role}, ${start} עד ${end}, ${assigned.length} מתוך ${shift.requiredCount} עובדים${isLocked ? " — נעולה לעריכה" : ""}`}
    >
      {/* Accent strip — pinned to inline-start (RTL = right side). Gradient fade for premium feel. */}
      {(restingState === "ok" ||
        restingState === "warning" ||
        restingState === "conflict" ||
        restingState === "open") && (
        <span
          aria-hidden
          className="absolute inset-y-1 start-0 w-[3px] rounded-full"
          style={{ background: stateAccentGradient(restingState) }}
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
        <div className="flex items-center gap-1 shrink-0">
          {shift.requiredCount > 1 && (
            <span
              aria-label={`דורש ${shift.requiredCount} עובדים`}
              className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-primary/10 text-primary tabular-nums"
            >
              ×{shift.requiredCount}
            </span>
          )}
          <span
            className={cn(
              "text-[10px] font-bold rounded-full px-1.5 py-0.5",
              understaffed
                ? "bg-destructive/20 text-destructive"
                : "bg-success/20 text-success",
            )}
            aria-label={understaffed ? `${assigned.length} מתוך ${shift.requiredCount} — חסרים עובדים` : `${assigned.length} מתוך ${shift.requiredCount}`}
          >
            {assigned.length}/{shift.requiredCount}
          </span>
        </div>
      </div>

      {isLocked && lockedByName && (
        <p className="text-[10px] mb-1 opacity-70">נערך כעת ע"י {lockedByName}</p>
      )}

      <div className="flex flex-wrap gap-1">
        {/* Ghost chip preview — "Future State Preview" per design review */}
        {ghostEmployee && isOver && !isLocked && validationTone === "ok" && (
          <div className="ghost-chip">
            <EmployeeChip employee={ghostEmployee} density={density} ghost />
          </div>
        )}
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
                      density={density}
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

function densitySizing(density: ShiftDensity): React.CSSProperties {
  switch (density) {
    case "compact":
      return {
        height: "var(--shift-card-compact-h)",
        paddingInline: "var(--shift-card-compact-px)",
        paddingBlock: "var(--shift-card-compact-py)",
      };
    case "dense":
      return {
        minHeight: "var(--shift-card-dense-min-h)",
        paddingInline: "var(--shift-card-dense-px)",
        paddingBlock: "var(--shift-card-dense-py)",
      };
    case "standard":
    default:
      return {
        minHeight: "var(--shift-card-standard-min-h)",
        paddingInline: "var(--shift-card-standard-px)",
        paddingBlock: "var(--shift-card-standard-py)",
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

/**
 * Subtle vertical gradient — fades from the state-accent token to a softer
 * transparent variant. Gives the left-border a more premium feel without
 * introducing any new color tokens.
 */
function stateAccentGradient(
  state: "ok" | "warning" | "conflict" | "open",
): string {
  const c = stateAccent(state);
  return `linear-gradient(to bottom, ${c} 0%, ${c} 60%, color-mix(in oklab, ${c} 35%, transparent) 100%)`;
}
