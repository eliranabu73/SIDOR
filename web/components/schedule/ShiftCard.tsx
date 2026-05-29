"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { useDroppable } from "@dnd-kit/core";
import { Clock, AlertTriangle, Lock, Plus, Sunrise, Sun, Sunset, Moon } from "lucide-react";
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
  /**
   * Mobile tap-to-assign. When provided, the entire card becomes tappable and
   * the empty-state hint changes from "drag" to "tap".
   */
  onTapAssign?: () => void;
}

const TIME_FORMAT = "HH:mm";

/** Period of day inferred from the shift's start hour. */
function shiftPeriod(startHour: number): {
  label: string;
  Icon: typeof Sun;
  tint: string;
} {
  if (startHour >= 5 && startHour < 11) return { label: "בוקר", Icon: Sunrise, tint: "text-amber-500" };
  if (startHour >= 11 && startHour < 16) return { label: "צהריים", Icon: Sun, tint: "text-orange-500" };
  if (startHour >= 16 && startHour < 21) return { label: "ערב", Icon: Sunset, tint: "text-rose-500" };
  return { label: "לילה", Icon: Moon, tint: "text-indigo-400" };
}

/**
 * ShiftCard — design system co-authored with ChatGPT.
 * Rule: card background almost never changes. Only border, accent strip,
 * and (during drag) overlay tint shift between states. Tokens are in
 * `app/globals.css` under @theme as `--color-shift-*`.
 */
function ShiftCardImpl({
  shift,
  employees,
  validationTone = "neutral",
  density = "standard",
  isLocked = false,
  lockedByName,
  ghostEmployee = null,
  onUnassign,
  onSwap,
  onTapAssign,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `shift:${shift.id}`,
    data: { type: "shift", shiftId: shift.id },
    disabled: isLocked,
  });

  const startDt = DateTime.fromISO(shift.startsAt);
  const start = startDt.toFormat(TIME_FORMAT);
  const end = DateTime.fromISO(shift.endsAt).toFormat(TIME_FORMAT);
  const period = shiftPeriod(startDt.hour);

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
      onClick={onTapAssign && !isLocked ? onTapAssign : undefined}
      className={cn(
        "shift-card group relative rounded-lg border",
        // empty / dashed
        restingState === "empty" && "border-dashed opacity-95",
        // locked is visually quieter
        restingState === "locked" && "opacity-90 cursor-not-allowed",
        onTapAssign && !isLocked && "cursor-pointer hover:bg-primary/5 active:scale-[0.98] transition-transform",
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
            <period.Icon className={cn("h-3.5 w-3.5", period.tint)} aria-hidden />
            {shift.role}
            <span className="text-[10px] font-normal text-muted-foreground">· {period.label}</span>
          </span>
          <span dir="ltr" className="text-[11px] tabular-nums inline-flex items-center gap-1 opacity-80">
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
          onTapAssign && !isOpen ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTapAssign();
              }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
              aria-label="הוסף עובד למשמרת"
            >
              {understaffed && <AlertTriangle className="h-3 w-3" />}
              <Plus className="h-3 w-3" />
              הוסף עובד
            </button>
          ) : (
            <span className="text-[11px] italic inline-flex items-center gap-1 opacity-80">
              {understaffed && !isOpen && <AlertTriangle className="h-3 w-3" />}
              {isOpen ? "משמרת פתוחה — לעובדים לקחת" : "גרור עובד/ת לכאן"}
            </span>
          )
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
        {/* Add-more button on partly-staffed shifts, so users don't need to
            open a separate selection mode. */}
        {!empty && understaffed && onTapAssign && !isLocked && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTapAssign();
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
            aria-label="הוסף עוד עובד למשמרת"
          >
            <Plus className="h-3 w-3" />
            הוסף
          </button>
        )}
      </div>
    </div>
  );
}

// Memoised so re-renders of the parent ScheduleBoard don't waste paint
// on every individual cell when only one cell's data changed.
export const ShiftCard = React.memo(ShiftCardImpl);

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
