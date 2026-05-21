"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Check, AlertTriangle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { ShiftCard, type ShiftValidationTone } from "./ShiftCard";
import { ConfirmWarningsDialog } from "./ConfirmWarningsDialog";
import {
  useAssignMutation,
  useValidateAssignment,
} from "@/lib/queries";
import type {
  AssignBody,
  ApiErrorBody,
  Employee,
  RuleResult,
  Schedule,
  Shift,
} from "@/lib/types";

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
}

interface PendingDrop {
  shiftId: string;
  employeeId: string;
  expectedShiftVersion: number;
  warnings: RuleResult[];
}

export function ScheduleBoard({
  schedule,
  employees,
  weekStart,
  locationFilter = "all",
  roleFilter = "all",
  currentUserId,
}: Props) {
  const employeesById = React.useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const [activeEmployeeId, setActiveEmployeeId] = React.useState<string | null>(
    null,
  );
  const [validationByShift, setValidationByShift] = React.useState<
    Record<string, ShiftValidationTone>
  >({});
  const [pendingDrop, setPendingDrop] = React.useState<PendingDrop | null>(null);

  const validate = useValidateAssignment();
  const assign = useAssignMutation({
    onError: (err) => {
      const apiErr = err as Error & { status?: number; body?: ApiErrorBody };
      const status = (err as unknown as { status?: number }).status;
      const body =
        (err as unknown as { body?: ApiErrorBody }).body ?? undefined;
      if (status === 409 && body?.code === "VERSION_MISMATCH") {
        toast.error("המשמרת התעדכנה בינתיים, מרענן…");
        return;
      }
      if (status === 422 && body?.code === "CONSTRAINTS_VIOLATED") {
        const lines = (body.violations ?? [])
          .map((v) => v.message)
          .join(", ");
        toast.error(`השיבוץ נכשל: ${lines || "הפרות חוקים"}`);
        return;
      }
      toast.error(apiErr.message || "השיבוץ נכשל");
    },
    onSuccess: () => {
      toast.success("שיבוץ בוצע");
    },
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const onDragStart = (e: DragStartEvent) => {
    const empId =
      (e.active.data.current as { employeeId?: string } | undefined)?.employeeId;
    setActiveEmployeeId(empId ?? null);
    setValidationByShift({});
  };

  const onDragOver = (e: DragOverEvent) => {
    const over = e.over;
    const active = e.active;
    if (!over) return;
    const overData = over.data.current as { type?: string; shiftId?: string } | undefined;
    const activeData = active.data.current as { type?: string; employeeId?: string } | undefined;
    if (overData?.type !== "shift" || !overData.shiftId) return;
    if (activeData?.type !== "employee" || !activeData.employeeId) return;

    const shiftId = overData.shiftId;
    const employeeId = activeData.employeeId;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      validate.mutate(
        { shiftId, employeeId, action: "assign" },
        {
          onSuccess: (res) => {
            setValidationByShift((prev) => ({
              ...prev,
              [shiftId]:
                res.violations.length > 0
                  ? "error"
                  : res.warnings.length > 0
                    ? "warning"
                    : "ok",
            }));
          },
          onError: () => {
            setValidationByShift((prev) => ({ ...prev, [shiftId]: "neutral" }));
          },
        },
      );
    }, 200);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setActiveEmployeeId(null);
    const over = e.over;
    const active = e.active;
    const tonesSnapshot = validationByShift;
    setValidationByShift({});
    if (!over) return;
    const overData = over.data.current as { type?: string; shiftId?: string } | undefined;
    const activeData = active.data.current as { type?: string; employeeId?: string } | undefined;
    if (overData?.type !== "shift" || !overData.shiftId) return;
    if (activeData?.type !== "employee" || !activeData.employeeId) return;

    const shift = schedule.shifts.find((s) => s.id === overData.shiftId);
    if (!shift) return;
    if (shift.assignments.some((a) => a.employeeId === activeData.employeeId && a.status === "assigned")) {
      toast.info("העובד/ת כבר משובץ/ת במשמרת זו");
      return;
    }

    void performAssign({
      shift,
      employeeId: activeData.employeeId,
      acknowledgeWarnings: false,
      knownTone: tonesSnapshot[shift.id],
    });
  };

  const performAssign = async ({
    shift,
    employeeId,
    acknowledgeWarnings,
    knownTone,
  }: {
    shift: Shift;
    employeeId: string;
    acknowledgeWarnings: boolean;
    knownTone?: ShiftValidationTone;
  }) => {
    const body: AssignBody = {
      action: "assign",
      employeeId,
      expectedShiftVersion: shift.version,
      acknowledgeWarnings,
    };
    try {
      await assign.mutateAsync({ shiftId: shift.id, body });
    } catch (err) {
      if (err instanceof ApiError) {
        const apiBody = err.body as ApiErrorBody | null;
        if (err.status === 409 && apiBody?.code === "WARNINGS_REQUIRE_ACK") {
          setPendingDrop({
            shiftId: shift.id,
            employeeId,
            expectedShiftVersion: shift.version,
            warnings: apiBody.warnings ?? [],
          });
          return;
        }
      }
      // Other errors handled by onError of mutation.
      void knownTone;
    }
  };

  const confirmWarnings = async () => {
    if (!pendingDrop) return;
    const shift = schedule.shifts.find((s) => s.id === pendingDrop.shiftId);
    if (!shift) {
      setPendingDrop(null);
      return;
    }
    await performAssign({
      shift,
      employeeId: pendingDrop.employeeId,
      acknowledgeWarnings: true,
    });
    setPendingDrop(null);
  };

  const unassign = (shift: Shift, employeeId: string) => {
    assign.mutate({
      shiftId: shift.id,
      body: {
        action: "unassign",
        employeeId,
        expectedShiftVersion: shift.version,
      },
    });
  };

  const activeEmployee = activeEmployeeId
    ? employeesById[activeEmployeeId]
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-7 gap-2 min-w-[1100px]" role="grid">
        {Array.from({ length: 7 }, (_, day) => {
          const date = weekStart.plus({ days: day });
          return (
            <div key={day} className="flex flex-col gap-2" role="row">
              <div className="text-center text-xs font-semibold sticky top-0 bg-background pb-1 border-b">
                <div>{DAYS_HE[day]}</div>
                <div className="text-muted-foreground tabular-nums">
                  {date.toFormat("d.M")}
                </div>
              </div>
              <div className="flex flex-col gap-2 min-h-32">
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
                      onUnassign={(empId) => unassign(shift, empId)}
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

      <DragOverlay dropAnimation={null}>
        {activeEmployee ? (
          <DragChip
            employee={activeEmployee}
            tone={activeOverTone(validationByShift)}
          />
        ) : null}
      </DragOverlay>

      <ConfirmWarningsDialog
        open={pendingDrop !== null}
        warnings={pendingDrop?.warnings ?? []}
        onConfirm={() => void confirmWarnings()}
        onCancel={() => setPendingDrop(null)}
        pending={assign.isPending}
      />
    </DndContext>
  );
}

/**
 * DragChip — the floating element pinned to the cursor while dragging.
 * Per design review (ChatGPT, 2026-05-21):
 *   - EmployeeChip + tiny status pill, max 2 lines.
 *   - NO score, NO ghost shift card, NO rotation.
 *   - Status pill: ✓ מתאים · ⚠ אזהרה · ✕ חסום.
 */
function DragChip({
  employee,
  tone,
}: {
  employee: Employee;
  tone: ShiftValidationTone;
}) {
  const initials = employee.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <div className="flex flex-col items-start gap-1 select-none">
      <div className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-sm font-medium shadow-lg">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px]"
        >
          {initials}
        </span>
        <span className="max-w-44 truncate">{employee.fullName}</span>
      </div>
      {tone !== "neutral" && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shadow-md",
            tone === "ok" && "border-[var(--color-shift-ok-accent)] bg-[var(--color-drag-valid-bg)] text-[var(--color-shift-ok-accent)]",
            tone === "warning" && "border-[var(--color-shift-warning-accent)] bg-[var(--color-drag-warning-bg)] text-[var(--color-shift-warning-accent)]",
            tone === "error" && "border-[var(--color-shift-conflict-accent)] bg-[var(--color-drag-blocked-bg)] text-[var(--color-shift-conflict-accent)]",
          )}
        >
          {tone === "ok" && <><Check className="h-3 w-3" /> מתאים</>}
          {tone === "warning" && <><AlertTriangle className="h-3 w-3" /> אזהרה</>}
          {tone === "error" && <><Ban className="h-3 w-3" /> חסום</>}
        </span>
      )}
    </div>
  );
}

/** Returns the strongest non-neutral tone across all currently-hovered shifts. */
function activeOverTone(
  validationByShift: Record<string, ShiftValidationTone>,
): ShiftValidationTone {
  const tones = Object.values(validationByShift);
  if (tones.includes("error")) return "error";
  if (tones.includes("warning")) return "warning";
  if (tones.includes("ok")) return "ok";
  return "neutral";
}
