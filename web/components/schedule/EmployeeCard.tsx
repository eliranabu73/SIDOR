"use client";

import { useDraggable } from "@dnd-kit/core";
import { Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee, EmployeeScheduleMetrics } from "@/lib/types";

interface Props {
  employee: Employee;
  metrics?: EmployeeScheduleMetrics;
  onSelect?: () => void;
  isSelected?: boolean;
}

function fairnessTone(score?: number): {
  label: string;
  className: string;
} {
  if (score == null) return { label: "—", className: "bg-muted text-muted-foreground" };
  if (score >= 0.8) return { label: "מאוזן", className: "bg-success/15 text-success" };
  if (score >= 0.5) return { label: "סביר", className: "bg-warning/20 text-foreground" };
  return { label: "חוסר איזון", className: "bg-destructive/15 text-destructive" };
}

export function EmployeeCard({ employee, metrics, onSelect, isSelected }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `employee:${employee.id}`,
      data: { type: "employee", employeeId: employee.id },
    });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const hoursAssigned = metrics ? Math.round(metrics.weeklyAssignedMinutes / 60) : 0;
  const hoursTarget = metrics ? Math.round(metrics.weeklyTargetMinutes / 60) : 0;
  const fair = fairnessTone(metrics?.fairnessScore);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-2 rounded-lg border bg-card p-2 text-start shadow-xs hover:border-primary/40 hover:bg-accent cursor-grab active:cursor-grabbing touch-none focus:outline-none focus:ring-2 focus:ring-ring",
        isDragging && "opacity-50 ring-2 ring-primary",
        isSelected && "border-primary bg-primary/10 ring-2 ring-primary",
      )}
      aria-roledescription="עובד/ת ניתן/ת לגרירה"
      aria-label={`גרור את ${employee.fullName} למשמרת`}
      aria-pressed={isSelected ? true : undefined}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate inline-flex items-center gap-1">
          {isSelected && (
            <Check className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
          )}
          <span className="truncate">{employee.fullName}</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {employee.roles.join(" · ")}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-xs tabular-nums text-muted-foreground">
          {hoursAssigned}/{hoursTarget}ש'
        </span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", fair.className)}>
          {fair.label}
        </span>
      </div>
    </div>
  );
}
