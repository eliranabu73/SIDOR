"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee, Schedule, Shift } from "@/lib/types";

const DAYS_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const DAYS_LONG  = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function isActive(status: string): boolean {
  return status === "assigned" || status === "confirmed" || status === "tentative";
}

function buildMaps(
  shifts: Shift[],
  locFilter: string | "all",
  roleFilter: string | "all",
) {
  const byEmployee: Record<string, Record<number, Shift[]>> = {};
  const unassigned: Shift[] = [];

  for (const s of shifts) {
    if (locFilter !== "all" && s.locationId !== locFilter) continue;
    if (roleFilter !== "all" && s.role !== roleFilter) continue;

    const day = DateTime.fromISO(s.startsAt).weekday % 7;
    const empIds = s.assignments.filter((a) => isActive(a.status)).map((a) => a.employeeId);

    if (empIds.length === 0) {
      unassigned.push(s);
    } else {
      for (const id of empIds) {
        if (!byEmployee[id]) byEmployee[id] = {};
        if (!byEmployee[id]![day]) byEmployee[id]![day] = [];
        byEmployee[id]![day]!.push(s);
      }
    }
  }
  return { byEmployee, unassigned };
}

function fmt(iso: string) {
  return DateTime.fromISO(iso).toLocal().toFormat("HH:mm");
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Shift pill ──────────────────────────────────────────────────────────────

function ShiftPill({
  shift,
  onRemove,
  size = "md",
}: {
  shift: Shift;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn(
      "group relative flex items-center gap-0.5 rounded-lg font-medium",
      "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40",
      size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
    )}>
      <span dir="ltr" className="tabular-nums">{fmt(shift.startsAt)}–{fmt(shift.endsAt)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="הסר"
          className="hidden group-hover:flex ms-0.5 text-indigo-400 hover:text-red-500"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

// ─── Employee avatar ──────────────────────────────────────────────────────────

function EmpAvatar({ name, size = 7 }: { name: string; size?: number }) {
  const colors = [
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
  ];
  const color = colors[name.charCodeAt(0) % colors.length]!;
  return (
    <div className={cn(
      `h-${size} w-${size} shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold`,
      color,
    )}>
      {initials(name)}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface WeeklyGridProps {
  schedule: Schedule;
  employees: Employee[];
  weekStart: DateTime;
  locationFilter?: string | "all";
  roleFilter?: string | "all";
  onQuickAdd: (employeeId: string, date: DateTime) => void;
  onUnassign: (shift: Shift, employeeId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
}

// ─── Unassigned shifts section ────────────────────────────────────────────────

function UnassignedSection({
  shifts,
  weekStart,
  onRequestAssign,
}: {
  shifts: Shift[];
  weekStart: DateTime;
  onRequestAssign?: (shift: Shift) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (shifts.length === 0) return null;

  const byDay = React.useMemo(() => {
    const m: Record<number, Shift[]> = {};
    for (const s of shifts) {
      const d = DateTime.fromISO(s.startsAt).weekday % 7;
      if (!m[d]) m[d] = [];
      m[d]!.push(s);
    }
    return m;
  }, [shifts]);

  return (
    <div className="border rounded-xl overflow-hidden mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white text-[10px] font-bold">
            {shifts.length}
          </span>
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            משמרות פתוחות — ממתינות לשיבוץ
          </span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-amber-600 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="divide-y">
          {Object.entries(byDay).map(([dayStr, dayShifts]) => {
            const dayIdx = parseInt(dayStr, 10);
            const dayDate = weekStart.plus({ days: dayIdx });
            return (
              <div key={dayIdx} className="px-4 py-3 flex items-start gap-3">
                <div className="w-16 shrink-0">
                  <div className="text-xs font-semibold text-muted-foreground">{DAYS_LONG[dayIdx]}</div>
                  <div className="text-xs text-muted-foreground">{dayDate.day}/{dayDate.month}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dayShifts!.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onRequestAssign?.(s)}
                      className="flex items-center gap-1 rounded-lg border border-amber-300/60 bg-amber-100/60
                                 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-800
                                 dark:text-amber-200 hover:bg-amber-200/80 transition-colors"
                      title="לחץ לשיבוץ עובד"
                    >
                      <span dir="ltr">{fmt(s.startsAt)}–{fmt(s.endsAt)}</span>
                      <span className="text-amber-500">· שבץ +</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mobile single-day view ───────────────────────────────────────────────────

function MobileDay({
  dayIdx,
  dayDate,
  employees,
  byEmployee,
  unassigned,
  onQuickAdd,
  onUnassign,
  onRequestAssign,
}: {
  dayIdx: number;
  dayDate: DateTime;
  employees: Employee[];
  byEmployee: Record<string, Record<number, Shift[]>>;
  unassigned: Shift[];
  onQuickAdd: (id: string, date: DateTime) => void;
  onUnassign: (shift: Shift, empId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
}) {
  return (
    <div className="flex flex-col">
      {employees.map((emp) => {
        const shifts = byEmployee[emp.id]?.[dayIdx] ?? [];
        return (
          <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0">
            <EmpAvatar name={emp.fullName} size={8} />
            <span className="w-24 shrink-0 text-sm font-medium truncate">{emp.fullName}</span>
            <div className="flex flex-wrap gap-1 flex-1">
              {shifts.map((s) => (
                <ShiftPill key={s.id} shift={s} onRemove={() => onUnassign(s, emp.id)} />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onQuickAdd(emp.id, dayDate)}
              aria-label="הוסף משמרת"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                         border border-dashed border-border hover:border-indigo-400
                         hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30
                         text-muted-foreground transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {/* Unassigned for this specific day */}
      {unassigned.length > 0 && (
        <div className="mx-4 my-3 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3">
          <p className="text-xs font-semibold text-amber-700 mb-2">
            {unassigned.length} משמרות ממתינות לשיבוץ
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onRequestAssign?.(s)}
                className="flex items-center gap-1 rounded-lg border border-amber-300/60 bg-white
                           dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-800
                           hover:bg-amber-100 transition-colors"
              >
                <span dir="ltr">{fmt(s.startsAt)}–{fmt(s.endsAt)}</span>
                <span className="text-amber-500 text-[10px]">שבץ +</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Desktop full-week grid ───────────────────────────────────────────────────

function DesktopGrid({
  weekStart,
  employees,
  byEmployee,
  onQuickAdd,
  onUnassign,
}: {
  weekStart: DateTime;
  employees: Employee[];
  byEmployee: Record<string, Record<number, Shift[]>>;
  onQuickAdd: (id: string, date: DateTime) => void;
  onUnassign: (shift: Shift, empId: string) => void;
}) {
  const dayDates = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  const todayIdx = DateTime.now().weekday % 7;

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="text-3xl">👥</div>
        <p className="font-semibold">אין עובדים</p>
        <p className="text-sm text-muted-foreground">הוסף עובדים בהגדרות כדי לבנות סידור עבודה.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full table-fixed border-collapse" dir="rtl">
        <colgroup>
          <col className="w-40" />
          {Array.from({ length: 7 }).map((_, i) => <col key={i} />)}
        </colgroup>

        {/* Header */}
        <thead>
          <tr className="bg-muted/30">
            <th className="py-3 px-3 text-start text-xs font-semibold text-muted-foreground border-b">
              עובד/ת
            </th>
            {dayDates.map((dt, i) => {
              const isToday = i === todayIdx;
              return (
                <th key={i} className={cn(
                  "py-3 px-2 text-center text-xs font-semibold border-b border-s",
                  isToday ? "bg-indigo-500/5" : "",
                )}>
                  <div className={cn(isToday ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground")}>
                    {DAYS_SHORT[i]}
                  </div>
                  <div className={cn(
                    "mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday ? "bg-indigo-500 text-white font-bold" : "text-muted-foreground",
                  )}>
                    {dt.day}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Employee rows */}
        <tbody>
          {employees.map((emp, empIdx) => (
            <tr key={emp.id} className={cn("border-b last:border-0 group/row hover:bg-muted/10 transition-colors", empIdx % 2 === 0 ? "" : "bg-muted/5")}>
              {/* Name cell */}
              <td className="py-2 px-3 border-s first:border-s-0">
                <div className="flex items-center gap-2">
                  <EmpAvatar name={emp.fullName} size={7} />
                  <span className="text-xs font-medium truncate max-w-[7rem]" title={emp.fullName}>
                    {emp.fullName}
                  </span>
                </div>
              </td>

              {/* Day cells */}
              {dayDates.map((dt, dayIdx) => {
                const dayShifts = byEmployee[emp.id]?.[dayIdx] ?? [];
                const isToday = dayIdx === todayIdx;
                return (
                  <td key={dayIdx} className={cn(
                    "py-1.5 px-1.5 align-top border-s min-w-[5.5rem]",
                    isToday ? "bg-indigo-500/3" : "",
                  )}>
                    <div className="group/cell flex flex-col gap-1 min-h-[2.5rem]">
                      {dayShifts.map((s) => (
                        <ShiftPill
                          key={s.id}
                          shift={s}
                          size="sm"
                          onRemove={() => onUnassign(s, emp.id)}
                        />
                      ))}
                      {/* Add button — visible on cell hover */}
                      <button
                        type="button"
                        onClick={() => onQuickAdd(emp.id, dt)}
                        aria-label={`הוסף משמרת ל${emp.fullName}`}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full",
                          "border border-dashed border-transparent text-transparent",
                          "group-hover/cell:border-border group-hover/cell:text-muted-foreground",
                          "hover:!border-indigo-400 hover:!text-indigo-500 hover:!bg-indigo-50 dark:hover:!bg-indigo-950/30",
                          "transition-all",
                        )}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function WeeklyGrid({
  schedule,
  employees,
  weekStart,
  locationFilter = "all",
  roleFilter = "all",
  onQuickAdd,
  onUnassign,
  onRequestAssign,
}: WeeklyGridProps) {
  const { byEmployee, unassigned } = React.useMemo(
    () => buildMaps(schedule.shifts, locationFilter, roleFilter),
    [schedule.shifts, locationFilter, roleFilter],
  );

  const dayDates = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart],
  );

  const todayIdx = DateTime.now().weekday % 7;
  const [selectedDay, setSelectedDay] = React.useState<number>(() => todayIdx);

  const activeEmployees = employees.filter((e) => e.active);

  // unassigned split by day for mobile
  const unassignedByDay = React.useMemo(() => {
    const m: Record<number, Shift[]> = {};
    for (const s of unassigned) {
      const d = DateTime.fromISO(s.startsAt).weekday % 7;
      if (!m[d]) m[d] = [];
      m[d]!.push(s);
    }
    return m;
  }, [unassigned]);

  return (
    <>
      {/* ── MOBILE (< md) ───────────────────────────────────────── */}
      <div className="md:hidden flex flex-col">
        {/* Day tab strip */}
        <div className="flex items-center border-b bg-background sticky top-0 z-10 shadow-sm">
          <button
            type="button"
            aria-label="יום קודם"
            onClick={() => setSelectedDay((d) => Math.max(0, d - 1))}
            disabled={selectedDay === 0}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="flex flex-1">
            {dayDates.map((dt, i) => {
              const isActive = i === selectedDay;
              const isToday = i === todayIdx;
              const hasShifts = (unassignedByDay[i]?.length ?? 0) > 0 ||
                activeEmployees.some((e) => (byEmployee[e.id]?.[i]?.length ?? 0) > 0);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDay(i)}
                  className={cn(
                    "flex flex-1 flex-col items-center py-2 text-xs transition-colors border-b-2 relative",
                    isActive
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  <span>{DAYS_SHORT[i]}</span>
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    isToday ? "bg-indigo-500 text-white font-bold" : "",
                  )}>
                    {dt.day}
                  </span>
                  {/* Dot indicator for days with shifts */}
                  {hasShifts && !isActive && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-indigo-400" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="יום הבא"
            onClick={() => setSelectedDay((d) => Math.min(6, d + 1))}
            disabled={selectedDay === 6}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Day label bar */}
        <div className="px-4 py-2 bg-muted/20 border-b">
          <span className="text-sm font-semibold">
            יום {DAYS_LONG[selectedDay]}{" "}
            <span className="text-muted-foreground font-normal">
              {dayDates[selectedDay]?.toFormat("d/M")}
            </span>
          </span>
        </div>

        {activeEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <div className="text-2xl">👥</div>
            <p className="text-sm font-semibold">אין עובדים</p>
            <p className="text-xs text-muted-foreground">הוסף עובדים בהגדרות</p>
          </div>
        ) : (
          <MobileDay
            dayIdx={selectedDay}
            dayDate={dayDates[selectedDay]!}
            employees={activeEmployees}
            byEmployee={byEmployee}
            unassigned={unassignedByDay[selectedDay] ?? []}
            onQuickAdd={onQuickAdd}
            onUnassign={onUnassign}
            onRequestAssign={onRequestAssign}
          />
        )}
      </div>

      {/* ── DESKTOP (≥ md) ──────────────────────────────────────── */}
      <div className="hidden md:flex flex-col gap-3">
        <DesktopGrid
          weekStart={weekStart}
          employees={activeEmployees}
          byEmployee={byEmployee}
          onQuickAdd={onQuickAdd}
          onUnassign={onUnassign}
        />

        {/* Unassigned shifts — accordion at bottom, not inline in grid */}
        <UnassignedSection
          shifts={unassigned}
          weekStart={weekStart}
          onRequestAssign={onRequestAssign}
        />
      </div>
    </>
  );
}
