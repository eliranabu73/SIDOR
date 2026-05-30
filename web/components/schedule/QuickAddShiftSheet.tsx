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

/** Convert a local HH:MM on a given date to a UTC ISO string. */
function toUtcIso(date: DateTime, localTime: string, tz: string): string {
  const [hStr, mStr] = localTime.split(":") as [string, string];
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const local = date.setZone(tz).set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return local.toUTC().toISO()!;
}

export interface QuickAddShiftSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Employee | null;
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

  // Set defaults once data loads
  React.useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      setSelectedRoleId(roles[0]!.id);
    }
  }, [roles, selectedRoleId]);

  React.useEffect(() => {
    // Prefer employee's primary location
    const preferred = employee?.primaryLocationId;
    if (preferred && locations.some((l) => l.id === preferred)) {
      setSelectedLocationId(preferred);
    } else if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0]!.id);
    }
  }, [locations, employee?.primaryLocationId, selectedLocationId]);

  // Reset selection state each time the sheet opens for a new cell
  React.useEffect(() => {
    if (open) {
      setPreset(null);
      setUseCustom(false);
      setCustomStart("09:00");
      setCustomEnd("17:00");
      // Don't reset role/location — keep user's last choice as default
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.id, date?.toISO()]);

  const effectiveStart = useCustom ? customStart : (preset?.start ?? "");
  const effectiveEnd   = useCustom ? customEnd   : (preset?.end   ?? "");

  const isValid =
    !!employee &&
    !!date &&
    effectiveStart !== "" &&
    effectiveEnd !== "" &&
    !!selectedLocationId &&
    !!selectedRoleId &&
    !saving;

  const dayLabel = date ? (DAYS_HE_LONG[date.weekday % 7] ?? "") : "";

  const handleSave = async () => {
    if (!employee || !date || !effectiveStart || !effectiveEnd || !selectedLocationId || !selectedRoleId) return;
    setSaving(true);
    try {
      // 1. Ensure schedule exists for this week
      const weekStartISO = weekStart.startOf("day").toISO();
      if (!weekStartISO) throw new Error("שבוע לא תקין");
      const ensured = await ensureSchedule(weekStartISO);
      const schedId = ensured.id;

      // 2. Convert local times to UTC — handle midnight-crossing shifts
      let startUtc = toUtcIso(date, effectiveStart, timezone);
      let endDt = date.setZone(timezone).set({
        hour: parseInt(effectiveEnd.split(":")[0]!, 10),
        minute: parseInt(effectiveEnd.split(":")[1]!, 10),
        second: 0,
        millisecond: 0,
      });
      // If end ≤ start → shift crosses midnight
      const startDt = date.setZone(timezone).set({
        hour: parseInt(effectiveStart.split(":")[0]!, 10),
        minute: parseInt(effectiveStart.split(":")[1]!, 10),
        second: 0,
        millisecond: 0,
      });
      if (endDt <= startDt) endDt = endDt.plus({ days: 1 });
      const endUtc = endDt.toUTC().toISO()!;

      void startUtc; // already computed
      startUtc = startDt.toUTC().toISO()!;

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
        employeeId: employee.id,
        expectedShiftVersion: shift.version,
        acknowledgeWarnings: true,
      });

      toast.success(`משמרת נוספה ל${employee.fullName}`);
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הוספת משמרת נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-xl pb-safe max-h-[85dvh] overflow-y-auto"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base">
            הוסף משמרת
            {employee && date && (
              <span className="text-muted-foreground font-normal text-sm ms-2">
                {employee.fullName} · יום {dayLabel} {date.day}/{date.month}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
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
