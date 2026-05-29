"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
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
import {
  createLocation,
  fetchSettings,
  patchSettings,
  type OrgSettings,
} from "@/lib/api";

const DAYS_OF_WEEK: { value: number; short: string; long: string }[] = [
  { value: 0, short: "א", long: "ראשון" },
  { value: 1, short: "ב", long: "שני" },
  { value: 2, short: "ג", long: "שלישי" },
  { value: 3, short: "ד", long: "רביעי" },
  { value: 4, short: "ה", long: "חמישי" },
  { value: 5, short: "ו", long: "שישי" },
  { value: 6, short: "ש", long: "שבת" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: OrgSettings | undefined;
}

export function BusinessHoursDialog({ open, onOpenChange, settings }: Props) {
  const qc = useQueryClient();
  const [bizStart, setBizStart] = React.useState("09:00");
  const [bizEnd, setBizEnd] = React.useState("18:00");
  const [activeDays, setActiveDays] = React.useState<number[]>([0, 1, 2, 3, 4]);
  const [branchName, setBranchName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Hydrate from settings when dialog opens
  React.useEffect(() => {
    if (!open || !settings) return;
    if (settings.laborRules.businessHoursStart) {
      setBizStart(settings.laborRules.businessHoursStart);
    }
    if (settings.laborRules.businessHoursEnd) {
      setBizEnd(settings.laborRules.businessHoursEnd);
    }
    const lrUnknown = settings.laborRules as unknown as {
      activeDaysOfWeek?: number[];
    };
    if (Array.isArray(lrUnknown.activeDaysOfWeek)) {
      setActiveDays(lrUnknown.activeDaysOfWeek);
    }
    if (settings.locations.length > 0) {
      setBranchName(settings.locations[0]!.name);
    }
  }, [open, settings]);

  const toggleDay = (day: number) => {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const canSave =
    /^\d{2}:\d{2}$/.test(bizStart) &&
    /^\d{2}:\d{2}$/.test(bizEnd) &&
    activeDays.length > 0 &&
    branchName.trim().length >= 2 &&
    !saving;

  const onSave = async () => {
    setSaving(true);
    try {
      const fresh = await fetchSettings();
      await patchSettings({
        laborRules: {
          ...fresh.laborRules,
          businessHoursStart: bizStart,
          businessHoursEnd: bizEnd,
          ...({ activeDaysOfWeek: activeDays } as unknown as object),
        },
      });
      if (fresh.locations.length === 0) {
        await createLocation({
          name: branchName.trim(),
          timezone: fresh.defaultTimezone || "Asia/Jerusalem",
        });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["settings"] }),
        qc.invalidateQueries({ queryKey: ["locations"] }),
        qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
      ]);
      toast.success("פרטי העסק נשמרו");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-500" />
            הגדר עסק וסניף ראשי
          </DialogTitle>
          <DialogDescription>
            הגדר את שעות הפעילות, ימי העבודה ושם הסניף הראשי.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="branchName">שם הסניף הראשי</Label>
            <Input
              id="branchName"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="לדוגמה: סניף מרכזי"
              className="h-11"
              disabled={(settings?.locations.length ?? 0) > 0}
            />
            {(settings?.locations.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                לעריכת שם הסניף עבור להגדרות.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="bizStart">שעת פתיחה</Label>
              <Input
                id="bizStart"
                type="time"
                value={bizStart}
                onChange={(e) => setBizStart(e.target.value)}
                dir="ltr"
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bizEnd">שעת סגירה</Label>
              <Input
                id="bizEnd"
                type="time"
                value={bizEnd}
                onChange={(e) => setBizEnd(e.target.value)}
                dir="ltr"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ימי פעילות</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((d) => {
                const on = activeDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={on}
                    aria-label={d.long}
                    className={`flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors ${
                      on
                        ? "border-indigo-500 bg-indigo-500 text-white shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-indigo-400 hover:text-foreground"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? "שומר…" : "שמור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
