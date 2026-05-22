"use client";

import * as React from "react";
import { CalendarRange, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchEmployeeActivity,
  saveAvailability,
  type EmployeeAvailabilityRule,
} from "@/lib/api";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
};

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
type Slot = "morning" | "afternoon" | "evening";
const SLOTS: Array<{ id: Slot; label: string; start: string; end: string }> = [
  { id: "morning", label: "בוקר", start: "06:00:00", end: "12:00:00" },
  { id: "afternoon", label: "צהריים", start: "12:00:00", end: "18:00:00" },
  { id: "evening", label: "ערב", start: "18:00:00", end: "23:59:00" },
];

type State = Record<number, Record<Slot, boolean>>;

function emptyState(): State {
  const s: State = {};
  for (let d = 0; d < 7; d++) {
    s[d] = { morning: false, afternoon: false, evening: false };
  }
  return s;
}

function hydrate(rules: EmployeeAvailabilityRule[]): State {
  const s = emptyState();
  for (const r of rules) {
    if (r.type !== "available" && r.type !== "preferred") continue;
    for (const slot of SLOTS) {
      if (r.startLocalTime <= slot.start && r.endLocalTime >= slot.end) {
        s[r.dayOfWeek]![slot.id] = true;
      }
    }
  }
  return s;
}

export function AvailabilityDialog({ open, onOpenChange, token }: Props) {
  const [state, setState] = React.useState<State>(emptyState());
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchEmployeeActivity(token)
      .then((data) => setState(hydrate(data.availability)))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "טעינה נכשלה"),
      )
      .finally(() => setLoading(false));
  }, [open, token]);

  const toggle = (day: number, slot: Slot) => {
    setState((prev) => ({
      ...prev,
      [day]: { ...prev[day]!, [slot]: !prev[day]![slot] },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const rules: Array<{
        dayOfWeek: number;
        startLocalTime: string;
        endLocalTime: string;
        type: "AVAILABLE" | "UNAVAILABLE" | "PREFERRED";
      }> = [];
      for (let d = 0; d < 7; d++) {
        for (const slot of SLOTS) {
          if (state[d]![slot.id]) {
            rules.push({
              dayOfWeek: d,
              startLocalTime: slot.start,
              endLocalTime: slot.end,
              type: "AVAILABLE",
            });
          }
        }
      }
      await saveAvailability(token, rules);
      toast.success("הזמינות נשמרה");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-indigo-500" />
            הזמינות שלי
          </DialogTitle>
          <DialogDescription>
            סמן/י באילו ימים ושעות אתה זמין/ה לעבוד. המנהל יבנה סידור לפי זה.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="rounded-xl border border-border bg-card/50 p-3">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div />
              {SLOTS.map((s) => (
                <div key={s.id} className="font-semibold text-muted-foreground">
                  {s.label}
                </div>
              ))}
              {DAYS.map((label, day) => (
                <React.Fragment key={day}>
                  <div className="flex items-center justify-end text-xs font-semibold text-muted-foreground">
                    {label}
                  </div>
                  {SLOTS.map((s) => {
                    const active = state[day]?.[s.id];
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(day, s.id)}
                        className={`h-10 rounded-md border text-xs transition-all ${
                          active
                            ? "border-transparent bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                        aria-pressed={active}
                      >
                        {active ? "✓" : ""}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button variant="glow" onClick={save} disabled={saving || loading}>
            <Save className="h-4 w-4" />
            {saving ? "שומר…" : "שמור זמינות"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
