"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateTime } from "luxon";
import type {
  AssignmentProposal,
  AutoScheduleWeights,
  Employee,
  Shift,
} from "@/lib/types";
import { Sparkles } from "lucide-react";

const DAYS_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: (weights: AutoScheduleWeights) => Promise<AssignmentProposal[]>;
  onApply: (proposals: AssignmentProposal[]) => Promise<void>;
  /** For resolving proposal employeeId/shiftId → readable name + time. */
  employees: Employee[];
  shifts: Shift[];
  loading?: boolean;
}

const DEFAULT_WEIGHTS: AutoScheduleWeights = {
  fairness: 0.5,
  preference: 0.3,
  continuity: 0.1,
  cost: 0.1,
};

export function AutoScheduleDialog({
  open,
  onOpenChange,
  onPreview,
  onApply,
  employees,
  shifts,
  loading,
}: Props) {
  const [weights, setWeights] = React.useState<AutoScheduleWeights>(DEFAULT_WEIGHTS);
  const [preview, setPreview] = React.useState<AssignmentProposal[] | null>(null);
  const [pending, setPending] = React.useState(false);

  const employeesById = React.useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );
  const shiftsById = React.useMemo(
    () => Object.fromEntries(shifts.map((s) => [s.id, s])),
    [shifts],
  );

  const describeShift = (shiftId: string): string => {
    const s = shiftsById[shiftId];
    if (!s) return "משמרת";
    const start = DateTime.fromISO(s.startsAt).toLocal();
    const day = DAYS_SHORT[start.weekday % 7] ?? "";
    return `${day} ${start.toFormat("HH:mm")}–${DateTime.fromISO(s.endsAt).toLocal().toFormat("HH:mm")}`;
  };

  const slider = (key: keyof AutoScheduleWeights, label: string) => (
    <div className="space-y-1">
      <div className="flex justify-between">
        <Label htmlFor={`w-${key}`}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {weights[key].toFixed(2)}
        </span>
      </div>
      <input
        id={`w-${key}`}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={weights[key]}
        onChange={(e) =>
          setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))
        }
        className="w-full accent-primary"
      />
    </div>
  );

  const runPreview = async () => {
    setPending(true);
    try {
      const p = await onPreview(weights);
      setPreview(p);
    } finally {
      setPending(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setPending(true);
    try {
      await onApply(preview);
      onOpenChange(false);
      setPreview(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            שיבוץ אוטומטי
          </DialogTitle>
          <DialogDescription>
            הגדר את חשיבות כל פרמטר ותוצג הצעת שיבוץ לפני שמירה.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {slider("fairness", "הוגנות")}
          {slider("preference", "העדפות עובדים")}
          {slider("continuity", "רציפות משמרות")}
          {slider("cost", "עלות")}
        </div>

        {preview ? (
          <div className="rounded-md border bg-muted/30 p-3 max-h-60 overflow-y-auto space-y-2">
            <div className="text-sm font-medium">
              {preview.length} הצעות שיבוץ
            </div>
            <ul className="space-y-1.5 text-xs">
              {preview.slice(0, 12).map((p, i) => {
                const emp = employeesById[p.employeeId];
                return (
                  <li
                    key={`${p.shiftId}-${p.employeeId}-${i}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">
                        {emp?.fullName ?? "עובד/ת"}
                      </span>
                      <span dir="ltr" className="truncate text-[11px] text-muted-foreground tabular-nums text-end">
                        {describeShift(p.shiftId)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.round(p.score * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || pending}>
            ביטול
          </Button>
          {preview ? (
            <Button onClick={apply} disabled={pending}>
              {pending ? "מחיל…" : "החל הצעות"}
            </Button>
          ) : (
            <Button onClick={runPreview} disabled={pending || loading}>
              {pending ? "מחשב…" : "הצג הצעה"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
