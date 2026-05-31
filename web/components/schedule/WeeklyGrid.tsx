"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Employee, Schedule, Shift } from "@/lib/types";

const DAYS_LONG  = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DAYS_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

function isActive(status: string) {
  return status === "assigned" || status === "confirmed" || status === "tentative";
}

function fmt(iso: string) {
  return DateTime.fromISO(iso).toLocal().toFormat("HH:mm");
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300",
];

function empColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]!;
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <div className={cn(
      "shrink-0 rounded-full flex items-center justify-center font-bold",
      empColor(name),
      size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-xs",
    )}>
      {initials(name)}
    </div>
  );
}

// ─── Build agenda data: per-day list of {shift, employees} ───────────────────

interface AgendaShift {
  shift: Shift;
  employees: Employee[];
  unassigned: boolean;
}

function buildAgenda(
  shifts: Shift[],
  employeesById: Record<string, Employee>,
  locFilter: string | "all",
  roleFilter: string | "all",
): Record<number, AgendaShift[]> {
  const byDay: Record<number, AgendaShift[]> = {};

  for (const s of shifts) {
    if (locFilter !== "all" && s.locationId !== locFilter) continue;
    if (roleFilter !== "all" && s.role !== roleFilter) continue;

    const day = DateTime.fromISO(s.startsAt).weekday % 7;
    if (!byDay[day]) byDay[day] = [];

    const empIds = s.assignments.filter((a) => isActive(a.status)).map((a) => a.employeeId);
    const emps = empIds.map((id) => employeesById[id]).filter(Boolean) as Employee[];

    byDay[day]!.push({ shift: s, employees: emps, unassigned: emps.length === 0 });
  }

  for (const list of Object.values(byDay)) {
    list.sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt));
  }

  return byDay;
}

// ─── build old byEmployee map for desktop ────────────────────────────────────

function buildByEmployee(
  shifts: Shift[],
  locFilter: string | "all",
  roleFilter: string | "all",
): { byEmployee: Record<string, Record<number, Shift[]>>; unassigned: Shift[] } {
  const byEmployee: Record<string, Record<number, Shift[]>> = {};
  const unassigned: Shift[] = [];

  for (const s of shifts) {
    if (locFilter !== "all" && s.locationId !== locFilter) continue;
    if (roleFilter !== "all" && s.role !== roleFilter) continue;

    const day = DateTime.fromISO(s.startsAt).weekday % 7;
    const empIds = s.assignments.filter((a) => isActive(a.status)).map((a) => a.employeeId);

    if (empIds.length === 0) { unassigned.push(s); continue; }
    for (const id of empIds) {
      if (!byEmployee[id]) byEmployee[id] = {};
      if (!byEmployee[id]![day]) byEmployee[id]![day] = [];
      byEmployee[id]![day]!.push(s);
    }
  }
  return { byEmployee, unassigned };
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface WeeklyGridProps {
  schedule: Schedule;
  employees: Employee[];
  weekStart: DateTime;
  locationFilter?: string | "all";
  roleFilter?: string | "all";
  /** Cell click — employee + date pre-selected */
  onQuickAdd: (employeeId: string, date: DateTime) => void;
  /** Day-level "+" — only date provided, employee picked inside sheet */
  onAddForDay: (date: DateTime) => void;
  onUnassign: (shift: Shift, employeeId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
  /** Delete the whole shift (all assignments). */
  onDeleteShift?: (shift: Shift) => void;
}

// ─── MOBILE: Agenda view ─────────────────────────────────────────────────────
// One scrollable card per day. Each shift = a row with avatar + name + time.

function AgendaDay({
  dayIdx,
  date,
  agendaShifts,
  onAdd,
  onUnassign,
  onRequestAssign,
  onDeleteShift,
  isToday,
}: {
  dayIdx: number;
  date: DateTime;
  agendaShifts: AgendaShift[];
  onAdd: () => void;
  onUnassign: (shift: Shift, empId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
  onDeleteShift?: (shift: Shift) => void;
  isToday: boolean;
}) {
  const hasContent = agendaShifts.length > 0;

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden shadow-sm",
      isToday ? "border-indigo-300 dark:border-indigo-700" : "border-border",
    )}>
      {/* Day header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3",
        isToday
          ? "bg-indigo-500 text-white"
          : "bg-muted/40 text-foreground",
      )}>
        <div className="flex items-center gap-2">
          {isToday && (
            <span className="text-[10px] font-bold bg-white/20 rounded-full px-2 py-0.5">היום</span>
          )}
          <span className="font-semibold text-sm">יום {DAYS_LONG[dayIdx]}</span>
          <span className={cn("text-sm", isToday ? "text-indigo-100" : "text-muted-foreground")}>
            {date.day}/{date.month}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          aria-label="הוסף משמרת"
          className={cn(
            "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            isToday
              ? "bg-white/20 hover:bg-white/30 text-white"
              : "bg-background hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-border hover:border-indigo-300 text-muted-foreground hover:text-indigo-600",
          )}
        >
          <Plus className="h-3 w-3" />
          הוסף
        </button>
      </div>

      {/* Shifts list */}
      {hasContent ? (
        <div className="divide-y">
          {agendaShifts.map(({ shift, employees, unassigned }) => (
            <div key={shift.id} className={cn(
              "flex items-center gap-3 px-4 py-3",
              unassigned ? "bg-amber-50/50 dark:bg-amber-950/10" : "bg-background",
            )}>
              {/* Time badge */}
              <div className="shrink-0 min-w-[4.5rem]">
                <div className="rounded-lg bg-muted/60 px-2 py-1 text-center">
                  <span dir="ltr" className="text-xs font-mono font-semibold tabular-nums text-foreground">
                    {fmt(shift.startsAt)}
                  </span>
                  <div className="text-[9px] text-muted-foreground">–{fmt(shift.endsAt)}</div>
                </div>
              </div>

              {/* Employees */}
              <div className="flex-1 min-w-0">
                {unassigned ? (
                  <button
                    type="button"
                    onClick={() => onRequestAssign?.(shift)}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-100/60 dark:bg-amber-900/20 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 transition-colors w-full"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    שבץ עובד/ת למשמרת זו
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {employees.map((emp) => (
                      <div key={emp.id} className="flex items-center gap-1.5 rounded-full bg-muted/50 pe-3 ps-1 py-1">
                        <Avatar name={emp.fullName} size="sm" />
                        <span className="text-xs font-medium text-foreground">{emp.fullName}</span>
                        <button
                          type="button"
                          onClick={() => onUnassign(shift, emp.id)}
                          aria-label={`הסר ${emp.fullName}`}
                          className="text-muted-foreground/50 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete whole shift */}
              {onDeleteShift && (
                <button
                  type="button"
                  onClick={() => onDeleteShift(shift)}
                  aria-label={`מחק משמרת ${fmt(shift.startsAt)}`}
                  title="מחק משמרת"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-4 text-center text-xs text-muted-foreground">
          אין משמרות ביום זה
        </div>
      )}
    </div>
  );
}

// ─── DESKTOP: employee × day grid ────────────────────────────────────────────

function ShiftPill({
  shift,
  onRemove,
  onDelete,
}: {
  shift: Shift;
  onRemove?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group flex items-center gap-0.5 rounded-md bg-indigo-500/10 border border-indigo-300/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 text-[10px] font-medium">
      <span dir="ltr" className="tabular-nums">{fmt(shift.startsAt)}–{fmt(shift.endsAt)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="הסר עובד/ת מהמשמרת"
          title="הסר עובד/ת"
          className="hidden group-hover:flex text-indigo-400 hover:text-red-500"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="מחק משמרת"
          title="מחק משמרת"
          className="hidden group-hover:flex text-indigo-400 hover:text-red-600"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function UnassignedAccordion({
  shifts,
  weekStart,
  onRequestAssign,
  onDeleteShift,
}: {
  shifts: Shift[];
  weekStart: DateTime;
  onRequestAssign?: (shift: Shift) => void;
  onDeleteShift?: (shift: Shift) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (!shifts.length) return null;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100/80 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white text-[10px] font-bold shrink-0">
            {shifts.length}
          </span>
          משמרות פתוחות — ממתינות לשיבוץ
        </span>
        <ChevronDown className={cn("h-4 w-4 text-amber-600 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
          {shifts.map((s) => {
            const day = DateTime.fromISO(s.startsAt).weekday % 7;
            const dt = weekStart.plus({ days: day });
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-background">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  {DAYS_LONG[day]} {dt.day}/{dt.month}
                </span>
                <span dir="ltr" className="text-xs font-mono tabular-nums text-foreground">
                  {fmt(s.startsAt)}–{fmt(s.endsAt)}
                </span>
                <button
                  type="button"
                  onClick={() => onRequestAssign?.(s)}
                  className="ms-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                >
                  שבץ עובד +
                </button>
                {onDeleteShift && (
                  <button
                    type="button"
                    onClick={() => onDeleteShift(s)}
                    aria-label="מחק משמרת"
                    title="מחק משמרת"
                    className="rounded-md p-1 text-muted-foreground/50 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DesktopGrid({
  weekStart,
  employees,
  byEmployee,
  unassigned,
  onQuickAdd,
  onUnassign,
  onRequestAssign,
  onDeleteShift,
}: {
  weekStart: DateTime;
  employees: Employee[];
  byEmployee: Record<string, Record<number, Shift[]>>;
  unassigned: Shift[];
  onQuickAdd: (id: string, date: DateTime) => void;
  onUnassign: (shift: Shift, empId: string) => void;
  onRequestAssign?: (shift: Shift) => void;
  onDeleteShift?: (shift: Shift) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  const todayIdx = DateTime.now().weekday % 7;

  if (!employees.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="text-4xl">👥</div>
        <p className="font-semibold">אין עובדים</p>
        <p className="text-sm text-muted-foreground">הוסף עובדים בהגדרות כדי לבנות סידור</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border shadow-sm">
        <table className="w-full table-fixed border-collapse" dir="rtl">
          <colgroup>
            <col className="w-40" />
            {Array.from({ length: 7 }).map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr className="bg-muted/30">
              <th className="py-3 px-3 text-start text-xs font-semibold text-muted-foreground border-b">עובד/ת</th>
              {days.map((dt, i) => {
                const isToday = i === todayIdx;
                return (
                  <th key={i} className={cn("py-3 px-1 text-center border-b border-s", isToday ? "bg-indigo-500/8" : "")}>
                    <div className={cn("text-[10px] font-semibold", isToday ? "text-indigo-600" : "text-muted-foreground")}>
                      {DAYS_SHORT[i]}
                    </div>
                    <div className={cn(
                      "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday ? "bg-indigo-500 text-white font-bold" : "text-muted-foreground",
                    )}>
                      {dt.day}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, idx) => (
              <tr key={emp.id} className={cn("border-b last:border-0 hover:bg-muted/10 transition-colors", idx % 2 === 1 && "bg-muted/5")}>
                <td className="py-2 px-3 border-s first:border-s-0">
                  <div className="flex items-center gap-2">
                    <Avatar name={emp.fullName} size="sm" />
                    <span className="text-xs font-medium truncate max-w-[6.5rem]" title={emp.fullName}>{emp.fullName}</span>
                  </div>
                </td>
                {days.map((dt, dayIdx) => {
                  const dayShifts = byEmployee[emp.id]?.[dayIdx] ?? [];
                  return (
                    <td key={dayIdx} className={cn("py-1 px-1 align-top border-s min-w-[5rem]", dayIdx === todayIdx && "bg-indigo-500/3")}>
                      <div className="group/cell flex flex-col gap-0.5 min-h-[2rem]">
                        {dayShifts.map((s) => (
                          <ShiftPill
                            key={s.id}
                            shift={s}
                            onRemove={() => onUnassign(s, emp.id)}
                            onDelete={onDeleteShift ? () => onDeleteShift(s) : undefined}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => onQuickAdd(emp.id, dt)}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-transparent text-transparent group-hover/cell:border-border group-hover/cell:text-muted-foreground hover:!border-indigo-400 hover:!text-indigo-500 hover:!bg-indigo-50 dark:hover:!bg-indigo-950/30 transition-all"
                          aria-label={`הוסף משמרת ל${emp.fullName}`}
                        >
                          <Plus className="h-2.5 w-2.5" />
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

      <UnassignedAccordion shifts={unassigned} weekStart={weekStart} onRequestAssign={onRequestAssign} onDeleteShift={onDeleteShift} />
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function WeeklyGrid({
  schedule,
  employees,
  weekStart,
  locationFilter = "all",
  roleFilter = "all",
  onQuickAdd,
  onAddForDay,
  onUnassign,
  onRequestAssign,
  onDeleteShift,
}: WeeklyGridProps) {
  const employeesById = React.useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const agendaByDay = React.useMemo(
    () => buildAgenda(schedule.shifts, employeesById, locationFilter, roleFilter),
    [schedule.shifts, employeesById, locationFilter, roleFilter],
  );

  const { byEmployee, unassigned } = React.useMemo(
    () => buildByEmployee(schedule.shifts, locationFilter, roleFilter),
    [schedule.shifts, locationFilter, roleFilter],
  );

  const dayDates = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart],
  );

  const todayIdx = DateTime.now().weekday % 7;
  const activeEmployees = employees.filter((e) => e.active);

  return (
    <>
      {/* ── MOBILE: Agenda (scrollable day cards) ─────────────────── */}
      <div className="md:hidden flex flex-col gap-3 p-3">
        {dayDates.map((dt, dayIdx) => (
          <AgendaDay
            key={dayIdx}
            dayIdx={dayIdx}
            date={dt}
            agendaShifts={agendaByDay[dayIdx] ?? []}
            onAdd={() => onAddForDay(dt)}
            onUnassign={onUnassign}
            onRequestAssign={onRequestAssign}
            onDeleteShift={onDeleteShift}
            isToday={dayIdx === todayIdx}
          />
        ))}
      </div>

      {/* ── DESKTOP: employee×day grid + accordion ─────────────────── */}
      <div className="hidden md:flex flex-col gap-0">
        <DesktopGrid
          weekStart={weekStart}
          employees={activeEmployees}
          byEmployee={byEmployee}
          unassigned={unassigned}
          onQuickAdd={onQuickAdd}
          onUnassign={onUnassign}
          onRequestAssign={onRequestAssign}
          onDeleteShift={onDeleteShift}
        />
      </div>
    </>
  );
}
