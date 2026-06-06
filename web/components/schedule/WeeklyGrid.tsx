"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, GripVertical, Plus, Trash2, X } from "lucide-react";
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

// Shifts are coloured by DAY-PART (morning / noon / evening / night) so the
// schedule is instantly scannable: בוקר ירוק · צהריים צהוב · ערב סגול — the exact
// mapping requested. Deterministic by local start-hour (not a hash), so every
// morning shift is the same green regardless of role. Tint 25% + text 900/200
// keeps >=4.5:1 contrast in light + dark. Never colour-only: the Legend and each
// chip carry the time/role text label too.
const DAYPART_COLORS = {
  morning: "bg-emerald-500/25 border-emerald-500/60 text-emerald-900 dark:text-emerald-100",
  noon: "bg-amber-500/25 border-amber-500/60 text-amber-900 dark:text-amber-100",
  evening: "bg-violet-500/25 border-violet-500/60 text-violet-900 dark:text-violet-100",
  night: "bg-indigo-500/25 border-indigo-500/60 text-indigo-900 dark:text-indigo-100",
} as const;

/** Stable template key for a shift: prefer role + time-of-day over raw ISO. */
function shiftTemplateKey(shift: Shift): string {
  return `${shift.role ?? ""}|${fmt(shift.startsAt)}-${fmt(shift.endsAt)}`;
}

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** Day-part bucket from the shift's LOCAL start hour. */
function dayPartOf(startIso: string): keyof typeof DAYPART_COLORS {
  const h = DateTime.fromISO(startIso).toLocal().hour;
  if (h < 12) return "morning"; // בוקר → ירוק
  if (h < 16) return "noon"; // צהריים → צהוב
  if (h < 22) return "evening"; // ערב → סגול
  return "night"; // לילה → אינדיגו
}

function shiftColor(shift: Shift): string {
  return DAYPART_COLORS[dayPartOf(shift.startsAt)];
}

const ROLE_DOTS = [
  "bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500",
  "bg-sky-500", "bg-fuchsia-500", "bg-cyan-500", "bg-lime-500",
];
function roleDot(role: string): string {
  return ROLE_DOTS[hashIndex(role, ROLE_DOTS.length)]!;
}

const NO_ROLE = "ללא תפקיד";
/** Group employees by their primary role so the grid is sectioned per role. */
function groupEmployeesByRole(employees: Employee[]): { role: string; emps: Employee[] }[] {
  const map = new Map<string, Employee[]>();
  for (const e of employees) {
    const role = e.roles?.[0] ?? NO_ROLE;
    (map.get(role) ?? map.set(role, []).get(role)!).push(e);
  }
  // Stable, readable order: named roles alphabetically, "ללא תפקיד" last.
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_ROLE ? 1 : b === NO_ROLE ? -1 : a.localeCompare(b, "he")))
    .map(([role, emps]) => ({ role, emps }));
}

// ─── Legend ──────────────────────────────────────────────────────────────────
// Maps each role to its dot colour and each distinct shift template (role +
// time) to its colour swatch, so the colour coding across the grid is explained
// and never colour-only (every swatch carries its time/role text label too).

interface ShiftTemplate {
  key: string;
  role: string;
  startsAt: string;
  endsAt: string;
}

function deriveLegend(
  employees: Employee[],
  shifts: Shift[],
  locFilter: string | "all",
  roleFilter: string | "all",
): { roles: string[]; templates: ShiftTemplate[] } {
  const roleSet = new Set<string>();
  for (const e of employees) roleSet.add(e.roles?.[0] ?? NO_ROLE);

  const tmplMap = new Map<string, ShiftTemplate>();
  for (const s of shifts) {
    if (locFilter !== "all" && s.locationId !== locFilter) continue;
    if (roleFilter !== "all" && s.role !== roleFilter) continue;
    if (s.role) roleSet.add(s.role);
    const key = shiftTemplateKey(s);
    if (!tmplMap.has(key)) {
      tmplMap.set(key, { key, role: s.role ?? NO_ROLE, startsAt: s.startsAt, endsAt: s.endsAt });
    }
  }

  const roles = [...roleSet].sort((a, b) =>
    a === NO_ROLE ? 1 : b === NO_ROLE ? -1 : a.localeCompare(b, "he"),
  );
  const templates = [...tmplMap.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { roles, templates };
}

function Legend({ roles, templates }: { roles: string[]; templates: ShiftTemplate[] }) {
  if (!roles.length && !templates.length) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/20 px-3 py-2 mb-3"
      role="group"
      aria-label="מקרא צבעים"
    >
      {roles.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">תפקידים:</span>
          {roles.map((role) => (
            <span key={role} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", roleDot(role))} />
              {role}
            </span>
          ))}
        </div>
      )}
      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">משמרות:</span>
          {templates.map((t) => (
            <span
              key={t.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                shiftColor({ role: t.role, startsAt: t.startsAt, endsAt: t.endsAt } as Shift),
              )}
            >
              <span dir="ltr" className="tabular-nums">{fmt(t.startsAt)}–{fmt(t.endsAt)}</span>
              {t.role && t.role !== NO_ROLE && (
                <span className="font-normal opacity-80">· {t.role}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "shrink-0 rounded-full flex items-center justify-center font-bold",
        empColor(name),
        size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-xs",
      )}
    >
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

/** Assigned-employee chip with a ≥44px-tall remove hit area (icon stays 12px). */
function EmpChip({ emp, onRemove }: { emp: Employee; onRemove: (e: React.MouseEvent) => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-muted/50 pe-1 ps-1 py-1">
      <Avatar name={emp.fullName} size="sm" />
      <span className="text-xs font-medium text-foreground">{emp.fullName}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`הסר ${emp.fullName}`}
        className="grid place-items-center min-h-[44px] min-w-[44px] text-muted-foreground/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * Mobile agenda shift row. The whole row is BOTH:
 *  - a drop target (useDroppable, `shift:<id>`) so a held-and-dragged employee
 *    card can land here, and
 *  - a primary tap target — tapping the row opens AssignEmployeeSheet. The 300ms
 *    TouchSensor delay (page.tsx) lets a quick tap fall through to onClick while a
 *    deliberate hold arms the drag, so both gestures coexist on one element.
 */
function AgendaShiftRow({
  shift,
  employees,
  unassigned,
  onRequestAssign,
  onUnassign,
  onDeleteShift,
}: {
  shift: Shift;
  employees: Employee[];
  unassigned: boolean;
  onRequestAssign?: (shift: Shift) => void;
  onUnassign: (shift: Shift, empId: string) => void;
  onDeleteShift?: (shift: Shift) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `shift:${shift.id}`,
    data: { type: "shift", shiftId: shift.id },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        unassigned ? "bg-amber-50/50 dark:bg-amber-950/10" : "bg-background",
        isOver && "ring-2 ring-inset ring-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20",
      )}
    >
      {/* Time badge — coloured per shift time */}
      <div className="shrink-0 min-w-[4.5rem]">
        <div className={cn("rounded-lg border px-2 py-1 text-center", shiftColor(shift))}>
          <span dir="ltr" className="text-xs font-mono font-bold tabular-nums">
            {fmt(shift.startsAt)}
          </span>
          <div className="text-[9px] opacity-80">–{fmt(shift.endsAt)}</div>
        </div>
      </div>

      {/* Whole-row tap target → opens AssignEmployeeSheet */}
      <button
        type="button"
        onClick={() => onRequestAssign?.(shift)}
        aria-label={`שבץ עובד/ת למשמרת ${fmt(shift.startsAt)}`}
        className="flex-1 min-w-0 text-start rounded-lg px-2 py-1.5 active:bg-accent/70 transition-colors touch-target"
      >
        {unassigned ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-100/60 dark:bg-amber-900/20 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Plus className="h-3.5 w-3.5 shrink-0" />
            שבץ עובד/ת למשמרת זו
          </span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {employees.map((emp) => (
              <EmpChip
                key={emp.id}
                emp={emp}
                onRemove={(ev) => {
                  ev.stopPropagation();
                  onUnassign(shift, emp.id);
                }}
              />
            ))}
          </span>
        )}
      </button>

      {/* Delete whole shift — stopPropagation island, ≥44px hit area */}
      {onDeleteShift && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteShift(shift);
          }}
          aria-label={`מחק משמרת ${fmt(shift.startsAt)}`}
          title="מחק משמרת"
          className="shrink-0 grid place-items-center touch-target rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

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

  // Group the day's shifts by role so role separation mirrors the desktop grid.
  const byRole = React.useMemo(() => {
    const map = new Map<string, AgendaShift[]>();
    for (const a of agendaShifts) {
      const role = a.shift.role || NO_ROLE;
      (map.get(role) ?? map.set(role, []).get(role)!).push(a);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === NO_ROLE ? 1 : b === NO_ROLE ? -1 : a.localeCompare(b, "he")))
      .map(([role, items]) => ({ role, items }));
  }, [agendaShifts]);

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

      {/* Shifts list — sectioned by role to mirror the desktop grid */}
      {hasContent ? (
        <div className="divide-y">
          {byRole.map(({ role, items }) => (
            <div key={role}>
              {/* Role section header */}
              <div className="flex items-center gap-1.5 px-4 py-1.5 bg-muted/50">
                <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", roleDot(role))} />
                <span className="text-[11px] font-bold text-foreground">{role}</span>
                <span className="text-[11px] font-normal text-muted-foreground/70">· {items.length}</span>
              </div>
              <div className="divide-y">
                {items.map((a) => (
                  <AgendaShiftRow
                    key={a.shift.id}
                    shift={a.shift}
                    employees={a.employees}
                    unassigned={a.unassigned}
                    onRequestAssign={onRequestAssign}
                    onUnassign={onUnassign}
                    onDeleteShift={onDeleteShift}
                  />
                ))}
              </div>
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
  const color = shiftColor(shift);
  return (
    <div className={cn(
      "group flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs font-semibold",
      color,
    )}>
      <span dir="ltr" className="tabular-nums">{fmt(shift.startsAt)}–{fmt(shift.endsAt)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="הסר עובד/ת מהמשמרת"
          title="הסר עובד/ת"
          className="hidden focus-visible:flex group-hover:flex group-focus-within:flex opacity-80 hover:text-red-500 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="מחק משמרת"
          title="מחק משמרת"
          className="hidden focus-visible:flex group-hover:flex group-focus-within:flex opacity-80 hover:text-red-600 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
        >
          <Trash2 className="h-3 w-3" />
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
              <th scope="col" className="py-3 px-3 text-start text-xs font-semibold text-muted-foreground border-b">עובד/ת</th>
              {days.map((dt, i) => {
                const isToday = i === todayIdx;
                return (
                  <th key={i} scope="col" className={cn("py-3 px-1 text-center border-b border-s", isToday ? "bg-indigo-500/8" : "")}>
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
            {groupEmployeesByRole(employees).map((group) => (
              <React.Fragment key={group.role}>
                <tr className="bg-muted/50">
                  <th scope="colgroup" colSpan={8} className="py-1.5 px-3 text-start border-b">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                      <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", roleDot(group.role))} />
                      {group.role}
                      <span className="font-normal text-muted-foreground/70">· {group.emps.length}</span>
                    </span>
                  </th>
                </tr>
                {group.emps.map((emp, idx) => (
              <tr key={emp.id} className={cn("border-b last:border-0 hover:bg-muted/10 transition-colors", idx % 2 === 1 && "bg-muted/5")}>
                <th scope="row" className="py-2 px-3 text-start font-normal border-s first:border-s-0">
                  <div className="flex items-center gap-2">
                    <Avatar name={emp.fullName} size="sm" />
                    <span className="text-xs font-medium truncate max-w-[6.5rem]" title={emp.fullName}>{emp.fullName}</span>
                  </div>
                </th>
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
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-border/40 text-muted-foreground/40 group-hover/cell:border-border group-hover/cell:text-muted-foreground focus-visible:border-indigo-400 focus-visible:text-indigo-500 hover:!border-indigo-400 hover:!text-indigo-500 hover:!bg-indigo-50 dark:hover:!bg-indigo-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 transition-all"
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
              </React.Fragment>
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
  const activeEmployees = React.useMemo(() => employees.filter((e) => e.active), [employees]);

  const legend = React.useMemo(
    () => deriveLegend(activeEmployees, schedule.shifts, locationFilter, roleFilter),
    [activeEmployees, schedule.shifts, locationFilter, roleFilter],
  );

  return (
    <>
      {/* ── MOBILE: Agenda (scrollable day cards) ─────────────────── */}
      <div className="md:hidden flex flex-col gap-3 p-3">
        <Legend roles={legend.roles} templates={legend.templates} />
        {/* Subtle gesture affordance — tap to assign, hold-and-drag to move. */}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground -mt-1 px-1">
          <GripVertical className="h-3 w-3 shrink-0" aria-hidden />
          הקש על משמרת לשיבוץ · החזק וגרור עובד/ת להזזה
        </p>
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
        <Legend roles={legend.roles} templates={legend.templates} />
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
