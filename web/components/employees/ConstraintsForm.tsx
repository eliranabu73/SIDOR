"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchEmployeePreferences,
  saveEmployeePreferences,
  type EmployeePreferencesPayload,
} from "@/lib/api";

interface Props {
  employeeId: string;
}

interface FormState {
  maxHoursPerWeek: string;
  preferredShiftLength: string; // "0" means "no preference"
  noWorkAfter: string;
  noWorkBefore: string;
  avoidWeekends: boolean;
  avoidNightShifts: boolean;
  notes: string;
}

function toForm(p: EmployeePreferencesPayload | null): FormState {
  return {
    maxHoursPerWeek:
      p?.maxHoursPerWeek != null ? String(p.maxHoursPerWeek) : "",
    preferredShiftLength:
      p?.preferredShiftLength != null ? String(p.preferredShiftLength) : "0",
    noWorkAfter: p?.noWorkAfter ?? "",
    noWorkBefore: p?.noWorkBefore ?? "",
    avoidWeekends: p?.avoidWeekends ?? false,
    avoidNightShifts: p?.avoidNightShifts ?? false,
    notes: p?.notes ?? "",
  };
}

function fromForm(s: FormState): EmployeePreferencesPayload {
  const max = s.maxHoursPerWeek.trim();
  const len = s.preferredShiftLength.trim();
  return {
    maxHoursPerWeek: max === "" ? null : Number(max),
    preferredShiftLength: len === "0" || len === "" ? null : Number(len),
    noWorkAfter: s.noWorkAfter ? `${s.noWorkAfter}:00` : null,
    noWorkBefore: s.noWorkBefore ? `${s.noWorkBefore}:00` : null,
    avoidWeekends: s.avoidWeekends,
    avoidNightShifts: s.avoidNightShifts,
    notes: s.notes.trim() === "" ? null : s.notes.trim(),
  };
}

export function ConstraintsForm({ employeeId }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["employee-preferences", employeeId],
    queryFn: () => fetchEmployeePreferences(employeeId),
  });

  const [state, setState] = React.useState<FormState>(toForm(null));
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!initialized.current && query.data !== undefined) {
      setState(toForm(query.data ?? null));
      initialized.current = true;
    }
  }, [query.data]);

  const saveMut = useMutation({
    mutationFn: () => saveEmployeePreferences(employeeId, fromForm(state)),
    onSuccess: () => {
      toast.success("האילוצים נשמרו");
      qc.invalidateQueries({ queryKey: ["employee-preferences", employeeId] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה"),
  });

  if (query.isLoading) return <Skeleton className="h-72 w-full" />;

  // Normalize "HH:mm:ss" → "HH:mm" for <input type="time">
  const timeFor = (v: string): string =>
    v.length >= 5 ? v.slice(0, 5) : v;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        saveMut.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="maxHours">מקסימום שעות לשבוע</Label>
          <Input
            id="maxHours"
            type="number"
            min={0}
            max={168}
            inputMode="numeric"
            value={state.maxHoursPerWeek}
            placeholder="לדוגמה: 42"
            onChange={(e) =>
              setState((s) => ({ ...s, maxHoursPerWeek: e.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shiftLength">אורך משמרת מועדף</Label>
          <Select
            value={state.preferredShiftLength}
            onValueChange={(v) =>
              setState((s) => ({ ...s, preferredShiftLength: v }))
            }
          >
            <SelectTrigger id="shiftLength">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">לא משנה</SelectItem>
              <SelectItem value="4">4 שעות</SelectItem>
              <SelectItem value="6">6 שעות</SelectItem>
              <SelectItem value="8">8 שעות</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="noWorkBefore">לא לעבוד לפני שעה</Label>
          <Input
            id="noWorkBefore"
            type="time"
            value={timeFor(state.noWorkBefore)}
            onChange={(e) =>
              setState((s) => ({ ...s, noWorkBefore: e.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="noWorkAfter">לא לעבוד אחרי שעה</Label>
          <Input
            id="noWorkAfter"
            type="time"
            value={timeFor(state.noWorkAfter)}
            onChange={(e) =>
              setState((s) => ({ ...s, noWorkAfter: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.avoidWeekends}
            onChange={(e) =>
              setState((s) => ({ ...s, avoidWeekends: e.target.checked }))
            }
            className="h-4 w-4 rounded border-input"
          />
          לא לעבוד בשבת
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.avoidNightShifts}
            onChange={(e) =>
              setState((s) => ({ ...s, avoidNightShifts: e.target.checked }))
            }
            className="h-4 w-4 rounded border-input"
          />
          לא משמרות לילה אחרי 22:00
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">הערות נוספות</Label>
        <textarea
          id="notes"
          dir="rtl"
          rows={4}
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
          placeholder="לדוגמה: זמין רק לאחר השעה 16:00 בימי שלישי, מעדיף משמרות בוקר…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saveMut.isPending}>
          {saveMut.isPending ? "שומר…" : "שמור אילוצים"}
        </Button>
      </div>
    </form>
  );
}
