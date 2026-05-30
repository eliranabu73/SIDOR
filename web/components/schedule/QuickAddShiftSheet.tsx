"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  createShift,
  ensureSchedule,
  fetchLocations,
  fetchRoles,
  patchAssignment,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Employee, ID } from "@/lib/types";

interface PresetTime {
  label: string;
  start: string; // HH:MM local
  end: string;   // HH:MM local
}

const PRESETS: PresetTime[] = [
  { label: "07–14", start: "07:00", end: "14:00" },
  { label: "08–16", start: "08:00", end: "16:00" },
  { label: "07–16", start: "07:00", end: "16:00" },
  { label: "09–17", start: "09:00", end: "17:00" },
  { label: "14–22", start: "14:00", end: "22:00" },
  { label: "17–23", start: "17:00", end: "23:00" },
];

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

function empColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]!;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
}

export interface QuickAddShiftSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-selected employee (from cell click). Null = day "+" button, show picker. */
  employee: Employee | null;
  /** Full list of active employees for the picker (used when employee=null). */
  employees?: Employee[];
  date: DateTime | null;
  weekStart: DateTime;
  /** If we already have the schedule DB id, skip the ensure call. */
  scheduleId?: ID | null;
  /** Timezone for converting local times to UTC (default: Asia/Jerusalem) */
  timezone?: string;
}

const DAYS_HE_LONG = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function QuickAddShiftSheet({
  open,
  onOpenChange,
  employee,
  employees = [],
  date,
  weekStart,
  scheduleId,
  timezone = "Asia/Jerusalem",
}: QuickAddShiftSheetProps) {
  const qc = useQueryClient();

  // Fetch roles and locations lazily when sheet opens
  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRoles,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const roles = rolesQ.data ?? [];
  const locations = locationsQ.data ?? [];

  const [preset, setPreset] = React.useState<PresetTime | null>(null);
  const [customStart, setCustomStart] = React.useState("09:00");
  const [customEnd, setCustomEnd] = React.useState("17:00");
  const [useCustom, setUseCustom] = React.useState(false);
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  /** Employee chosen inside the picker (when employee prop is null). */
  const [pickedEmployee, setPickedEmployee] = React.useState<Employee | null>(null);

  /** The employee we'll actually assign — either pre-selected or picker choice. */
  const effectiveEmployee = employee ?? pickedEmployee;

  // Set role default once data loads
  React.useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0]!.id);
    }
  }, [roles, selectedRoleId]);

  // Prefer employee's primary location
  React.useEffect(() => {
    const preferred = effectiveEmployee?.primaryLocationId;
    if (preferred && locations.some((l) => l.id === preferred)) {
      setSelectedLocationId(preferred);
    } else if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0]!.id);
    }
  }, [locations, effectiveEmployee?.primaryLocationId, selectedLocationId]);

  // Reset selection state each time the sheet opens
  React.useEffect(() => {
    if (open) {
      setPreset(null);
      setUseCustom(false);
      setCustomStart("09:00");
      setCustomEnd("17:00");
      setPickedEmployee(null);
      // Don't reset role/location — keep user's last choice as default
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.id, date?.toISO()]);

  const effectiveStart = useCustom ? customStart : (preset?.start ?? "");
  const effectiveEnd   = useCustom ? customEnd   : (preset?.end   ?? "");

  const isValid =
    !!effectiveEmployee &&
    !!date &&
    effectiveStart !== "" &&
    effectiveEnd !== "" &&
    !!selectedLocationId &&
    !!selectedRoleId &&
    !saving;

  const dayLabel = date ? (DAYS_HE_LONG[date.weekday % 7] ?? "") : "";

  const handleSave = async () => {
    if (!effectiveEmployee || !date || !effectiveStart || !effectiveEnd || !selectedLocationId || !selectedRoleId) return;
    setSaving(true);
    try {
      // 1. Ensure schedule exists for this week
      const weekStartISO = weekStart.startOf("day").toISO();
      if (!weekStartISO) throw new Error("שבוע לא תקין");
      const ensured = await ensureSchedule(weekStartISO);
      const schedId = ensured.id;
      void scheduleId; // parent may have it, but we always ensure to get fresh id

      // 2. Convert local times to UTC — handle midnight-crossing shifts
      const startDt = date.setZone(timezone).set({
        hour: parseInt(effectiveStart.split(":")[0]!, 10),
        minute: parseInt(effectiveStart.split(":")[1]!, 10),
        second: 0,
        millisecond: 0,
      });
      let endDt = date.setZone(timezone).set({
        hour: parseInt(effectiveEnd.split(":")[0]!, 10),
        minute: parseInt(effectiveEnd.split(":")[1]!, 10),
        second: 0,
        millisecond: 0,
      });
      // If end ≤ start → shift crosses midnight
      if (endDt <= startDt) endDt = endDt.plus({ days: 1 });

      const startUtc = startDt.toUTC().toISO()!;
      const endUtc   = endDt.toUTC().toISO()!;

      // 3. Create the shift
      const shift = await createShift({
        scheduleId: schedId,
        locationId: selectedLocationId,
        roleId: selectedRoleId,
        startAtUtc: startUtc,
        endAtUtc: endUtc,
        timezone,
      });

      // 4. Assign the employee
      await patchAssignment(shift.id, {
        action: "assign",
        employeeId: effectiveEmployee.id,
        expectedShiftVersion: shift.version,
        acknowledgeWarnings: true,
      });

      toast.success(`משמרת נוספה ל${effectiveEmployee.fullName}`);
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הוספת משמרת נכשלה");
    } finally {
      setSaving(false);
    }
  };

  /** Whether we're in "day +" mode — need to show employee picker. */
  const needEmployeePicker = employee === null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-xl pb-safe max-h-[90dvh] overflow-y-auto"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base">
            הוסף משמרת
            {date && (
              <span className="text-muted-foreground font-normal text-sm ms-2">
                {effectiveEmployee ? `${effectiveEmployee.fullName} · ` : ""}יום {dayLabel} {date.day}/{date.month}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Employee picker — only shown when no employee was pre-selected */}
          {needEmployeePicker && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">בחר עובד/ת</p>
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין עובדים זמינים</p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {employees.filter((e) => e.active).map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setPickedEmployee(emp)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors",
                        pickedEmployee?.id === emp.id
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                          : "border-border bg-background hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20",
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        "shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                        empColor(emp.fullName),
                      )}>
                        {initials(emp.fullName)}
                      </div>
                      <span className="text-sm font-medium flex-1">{emp.fullName}</span>
                      {pickedEmployee?.id === emp.id && (
                        <span className="text-indigo-500 text-xs font-semibold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preset time buttons */}
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">בחר שעות</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setPreset(p); setUseCustom(false); }}
                  className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    !useCustom && preset?.label === p.label
                      ? "border-indigo-500 bg-indigo-500 text-white shadow-sm"
                      : "border-border bg-background hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom time */}
          <div>
            <button
              type="button"
              onClick={() => { setUseCustom(true); setPreset(null); }}
              className={`text-sm rounded-lg border px-3 py-1.5 transition-colors ${
                useCustom
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-border text-muted-foreground hover:border-indigo-300"
              }`}
            >
              שעות מותאמות
            </button>

            {useCustom && (
              <div className="mt-3 flex items-center gap-3 text-sm" dir="ltr">
                <input
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs"
                />
              </div>
            )}
          </div>

          {/* Role selector — show only if org has multiple roles */}
          {roles.length > 1 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">תפקיד</p>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                      selectedRoleId === r.id
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-border text-muted-foreground hover:border-indigo-300"
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location selector — show only if multiple locations */}
          {locations.length > 1 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">סניף</p>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Save */}
          <Button
            type="button"
            className="w-full h-11"
            disabled={!isValid}
            onClick={() => void handleSave()}
          >
            {saving ? "שומר…" : "הוסף משמרת"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
