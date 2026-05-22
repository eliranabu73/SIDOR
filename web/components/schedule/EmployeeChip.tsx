"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee } from "@/lib/types";

export type ChipDensity = "compact" | "standard" | "dense";

interface Props {
  employee: Employee;
  density?: ChipDensity;
  /** Optional score / status to show in `dense` mode (0..1 → "94%"). */
  score?: number;
  onRemove?: () => void;
  variant?: "default" | "muted";
  /**
   * When true, the chip is rendered as a drag-over "ghost preview" inside a
   * shift card. Adds a smooth scale-in animation so the preview feels alive.
   */
  ghost?: boolean;
}

const GHOST_KEYFRAMES = `@keyframes chipIn {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}`;

/**
 * EmployeeChip — three density variants per design system:
 *   compact  : avatar only (initials)        — 24px circle, no text
 *   standard : avatar + first name (truncate) — 28px height
 *   dense    : avatar + full name + score    — 34px height
 *
 * Tokens in app/globals.css under @theme.
 */
export function EmployeeChip({
  employee,
  density = "standard",
  score,
  onRemove,
  variant = "default",
  ghost = false,
}: Props) {
  const ghostClass = ghost ? "animate-[chipIn_150ms_ease]" : "";
  const initials = employee.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

  // first-name only with last-initial when "אלירן אבו" -> "אלירן א."
  const parts = employee.fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? employee.fullName;
  const lastInitial = parts[1] ? `${parts[1][0]}.` : "";
  const standardName = lastInitial ? `${firstName} ${lastInitial}` : firstName;

  if (density === "compact") {
    return (
      <>
        {ghost ? <style>{GHOST_KEYFRAMES}</style> : null}
        <div
          title={employee.fullName}
          className={cn(
            "group inline-flex items-center justify-center rounded-full text-[10px] font-medium border",
            variant === "default"
              ? "bg-[var(--employee-chip-bg)] text-[var(--employee-chip-fg)] border-[var(--employee-chip-border)]"
              : "bg-muted text-muted-foreground",
            ghostClass,
          )}
          style={{
            width: "var(--employee-chip-compact-size)",
            height: "var(--employee-chip-compact-size)",
          }}
          aria-label={employee.fullName}
        >
          {initials}
        </div>
      </>
    );
  }

  const isDense = density === "dense";
  const heightVar = isDense
    ? "var(--employee-chip-dense-h)"
    : "var(--employee-chip-standard-h)";

  return (
    <>
      {ghost ? <style>{GHOST_KEYFRAMES}</style> : null}
    <div
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full px-2 text-xs font-medium border",
        variant === "default"
          ? "bg-[var(--employee-chip-bg)] text-[var(--employee-chip-fg)] border-[var(--employee-chip-border)]"
          : "bg-muted text-muted-foreground",
        ghostClass,
      )}
      style={{ height: heightVar }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full bg-primary/20 text-[10px] shrink-0"
        style={{ width: "20px", height: "20px" }}
        aria-hidden
      >
        {initials}
      </span>
      <span className={cn("truncate", isDense ? "max-w-44" : "max-w-28")}>
        {isDense ? employee.fullName : standardName}
      </span>
      {isDense && typeof score === "number" ? (
        <span className="text-[10px] opacity-70 tabular-nums shrink-0">
          {Math.round(score * 100)}%
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`הסר שיבוץ של ${employee.fullName}`}
          className="rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-primary/20 shrink-0"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
    </>
  );
}
