"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee } from "@/lib/types";

interface Props {
  employee: Employee;
  onRemove?: () => void;
  variant?: "default" | "muted";
}

export function EmployeeChip({ employee, onRemove, variant = "default" }: Props) {
  const initials = employee.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <div
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "default"
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted text-muted-foreground border",
      )}
    >
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px]"
        aria-hidden
      >
        {initials}
      </span>
      <span className="max-w-32 truncate">{employee.fullName}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`הסר שיבוץ של ${employee.fullName}`}
          className="rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-primary/20"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
