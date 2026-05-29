"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createShift,
  ensureSchedule,
  fetchLocations,
  fetchRoles,
  listShiftTemplates,
} from "@/lib/api";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO date of the week start being viewed; used to auto-create schedule on first shift. */
  weekStart: DateTime;
  /** Existing schedule id (UUID) if one already exists for that week. */
  scheduleId?: string | null;
  /**
   * Optional — when the dialog opens, auto-select the template whose name
   * matches (case-insensitive). Falls through silently if no match exists.
   */
  initialTemplateName?: string;
};

export function CreateShiftDialog({
  open,
  onOpenChange,
  weekStart,
  scheduleId,
  initialTemplateName,
}: Props) {
  const qc = useQueryClient();
  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRoles,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const templatesQ = useQuery({
    queryKey: ["shift-templates"],
    queryFn: listShiftTemplates,
    enabled: open,
    staleTime: 60_000,
  });
  const [templateId, setTemplateId] = React.useState("");

  // Default: today at 09:00 → 17:00
  const defaultDate = DateTime.now().setZone("Asia/Jerusalem").toFormat("yyyy-MM-dd");
  const [date, setDate] = React.useState(defaultDate);
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("17:00");
  const [locationId, setLocationId] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [count, setCount] = React.useState(1);

  // Pick first location/role as default when data lands.
  React.useEffect(() => {
    if (!locationId && locationsQ.data?.[0]?.id) setLocationId(locationsQ.data[0].id);
  }, [locationsQ.data, locationId]);
  React.useEffect(() => {
    if (!roleId && rolesQ.data?.[0]?.id) setRoleId(rolesQ.data[0].id);
  }, [rolesQ.data, roleId]);

  // Reset date to inside the viewed week if needed
  React.useEffect(() => {
    if (open) {
      const wsISO = weekStart.toISODate();
      if (wsISO && DateTime.fromISO(date) < weekStart) setDate(wsISO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-select a template by name when the dialog opens with a preset.
  React.useEffect(() => {
    if (!open || !initialTemplateName) return;
    const list = templatesQ.data;
    if (!list?.length) return;
    const needle = initialTemplateName.trim().toLowerCase();
    if (!needle) {
      setTemplateId("");
      return;
    }
    const match = list.find((t) => t.name.trim().toLowerCase() === needle);
    if (!match) return;
    setTemplateId(match.id);
    setStartTime(match.startLocalTime);
    setEndTime(match.endLocalTime);
    setCount(match.requiredEmployeeCount);
    if (match.locationId) setLocationId(match.locationId);
    if (match.roleId) setRoleId(match.roleId);
  }, [open, initialTemplateName, templatesQ.data]);

  const submit = useMutation({
    mutationFn: async () => {
      // Resolve schedule id — auto-create if missing.
      let realScheduleId = scheduleId;
      if (!realScheduleId || !/^[0-9a-f-]{36}$/i.test(realScheduleId)) {
        const wsISO = weekStart.toISODate();
        if (!wsISO) throw new Error("שבוע לא תקין");
        const ensured = await ensureSchedule(wsISO);
        realScheduleId = ensured.id;
      }
      // Build UTC instants from local date + times (Asia/Jerusalem)
      const start = DateTime.fromISO(`${date}T${startTime}`, {
        zone: "Asia/Jerusalem",
      });
      let end = DateTime.fromISO(`${date}T${endTime}`, {
        zone: "Asia/Jerusalem",
      });
      if (end <= start) end = end.plus({ days: 1 }); // night shift crossing midnight
      return createShift({
        scheduleId: realScheduleId,
        locationId,
        roleId,
        startAtUtc: start.toUTC().toISO() ?? "",
        endAtUtc: end.toUTC().toISO() ?? "",
        requiredEmployeeCount: count,
        timezone: "Asia/Jerusalem",
      });
    },
    onSuccess: async () => {
      toast.success("המשמרת נוצרה");
      // Force refresh of the schedule board
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "יצירת המשמרת נכשלה");
    },
  });

  const loadingMeta = locationsQ.isLoading || rolesQ.isLoading;
  const formReady = !!locationId && !!roleId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-indigo-500" />
            יצירת משמרת
          </DialogTitle>
          <DialogDescription>
            הגדר תאריך, שעות, תפקיד וסניף. נשבץ עובדים בהמשך.
          </DialogDescription>
        </DialogHeader>

        {loadingMeta ? (
          <div className="space-y-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : (
          <div className="space-y-4">
            {(templatesQ.data?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <Label htmlFor="template">תבנית (אופציונלי)</Label>
                <select
                  id="template"
                  value={templateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTemplateId(id);
                    const t = templatesQ.data?.find((x) => x.id === id);
                    if (t) {
                      setStartTime(t.startLocalTime);
                      setEndTime(t.endLocalTime);
                      setCount(t.requiredEmployeeCount);
                      if (t.locationId) setLocationId(t.locationId);
                      if (t.roleId) setRoleId(t.roleId);
                    }
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— ללא תבנית —</option>
                  {templatesQ.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.startLocalTime}–{t.endLocalTime}
                      {t.crossesMidnight ? "+1" : ""})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-1">
                <Label htmlFor="date">תאריך</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="start">התחלה</Label>
                <Input
                  id="start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end">סיום</Label>
                <Input
                  id="end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="role">תפקיד</Label>
                <select
                  id="role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {rolesQ.data?.length === 0 ? (
                    <option value="">אין תפקידים — צור אחד תחילה</option>
                  ) : null}
                  {rolesQ.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="location">סניף</Label>
                <select
                  id="location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {locationsQ.data?.length === 0 ? (
                    <option value="">אין סניפים — צור אחד תחילה</option>
                  ) : null}
                  {locationsQ.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="count">מספר עובדים נדרש</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            variant="glow"
            disabled={!formReady || submit.isPending || loadingMeta}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "יוצר…" : "צור משמרת"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
